var MotionDecoder = function(psx)
{
	var quantizeTable = new ArrayBuffer(0x80 * 4);
	
	this.psx = psx;
	
	this.iqY = new Int32Array(quantizeTable, 0, 0x40);
	this.iqUV = new Int32Array(quantizeTable, 0x40, 0x40);
	
	this.dma0 = new DMARegisters();
	this.dma1 = new DMARegisters();
	
	this.command = 0;
	this.runLengthDataAddress = 0;
}

// tables stolen from FPSE's MDEC.C
MotionDecoder.aanScales = [
	16384, 22725, 21407, 19266, 16384, 12873,  8867,  4520,
	22725, 31521, 29692, 26722, 22725, 17855, 12299,  6270,
	21407, 29692, 27969, 25172, 21407, 16819, 11585,  5906,
	19266, 26722, 25172, 22654, 19266, 15137, 10426,  5315,

	16384, 22725, 21407, 19266, 16384, 12873,  8867,  4520,
	12873, 17855, 16819, 15137, 12873, 10114,  6967,  3552,
	8867, 12299, 11585, 10426,  8867,  6967,  4799,  2446,
	4520,  6270,  5906,  5315,  4520,  3552,  2446,  1247
];

MotionDecoder.zigZagScan = [
	0 ,1 ,8 ,16,9 ,2 ,3 ,10,
	17,24,32,25,18,11,4 ,5 ,
	12,19,26,33,40,48,41,34,
	27,20,13,6 ,7 ,14,21,28,
	35,42,49,56,57,50,43,36,
	29,22,15,23,30,37,44,51,
	58,59,52,45,38,31,39,46,
	53,60,61,54,47,55,62,63
];

MotionDecoder.prototype.reset = function()
{
	for (var i = 0; i < 0x40; i++)
	{
		this.iqY[i] = 0;
		this.iqUV[i] = 0;
	}
}

MotionDecoder.prototype.install = function(hwregs)
{
	var self = this;
	
	this.dma0.wire(hwregs, 0x1f801080, this.execDMA0.bind(this));
	this.dma1.wire(hwregs, 0x1f801090, this.execDMA1.bind(this));
	
	hwregs.wire(0x1f801820,
		function() { return 0; },
		function(value) { self.command = value; }
	);
	
	hwregs.wire(0x1f801824,
		function() { return 0; },
		function(value) {}
	);
}

MotionDecoder.prototype.execDMA0 = function()
{
	if (this.dma0.chcr != 0x01000201)
		return;
	
	var dataSize = this.dma0.getSize();
	
	if (this.command == 0x60000000)
	{
		// cosine table; no need to implement
	}
	else if (this.command == 0x40000001)
	{
		this.initQuantizeTable(this.iqY, this.dma0.maddr);
		this.initQuantizeTable(this.iqUV, this.dma0.maddr + 0x40);
	}
	else if ((this.command & 0xf5ff0000) == 0x30000000)
	{
		this.runLengthDataAddress = this.dma0.madr;
	}
	else
	{
		this.psx.diags.warn("Unknown command 0x%08x", this.command);
	}
}

MotionDecoder.prototype.execDMA1 = function()
{
	if (this.dma1.chcr != 0x01000200)
		return;
	
	var memory = this.psx.memory;
	
	var dataSize = this.dma1.getSize();
	memory.compiled.invalidateRange(this.dma1.madr, dataSize);
	
	var writeAddress = this.dma1.madr;
	const is24Bits = (this.command & 0x08000000) == 0;
	const blockSize = 32 * (is24Bits ? 24 : 16);
	
	var decodeBlockBuffer = new Int32Array(0x40 * 6);
	var yuvPixels = new Int8Array(0x100 * 3);
	
	while (dataSize > 0)
	{
		this.runLengthDataAddress = this.runLengthToBlock(decodeBlockBuffer, this.runLengthDataAddress);
		MotionDecoder.convertToYuv(decodeBlockBuffer, yuvPixels);
		
		if (is24Bits)
			this.yuv2rgb24(yuvPixels, writeAddress);
		else
			this.yuv2rgb16(yuvPixels, writeAddress);
		
		size -= blockSize / 4;
		writeAddress += blockSize;
	}
}

MotionDecoder.prototype.runLengthToBlock = function(block, runLengthOffset)
{
	var memory = this.psx.memory;
	for (var i = 0; i < block.length; i++)
		block[i] = 0;
	
	var intermediate = new Int32ArrayBuffer(0x40);
	for (var i = 0; i < 6; i++)
	{
		var table = i < 2 ? this.iqUV : this.iqY;
		var rlCode = memory.read16(runLengthOffset);
		runLengthOffset += 2;
		
		var scale = rlCode >> 10;
		intermediate[0] = table[0] * ((rlCode << 22) >> 22);
		
		var zigZagIndex = 0;
		while (true)
		{
			rlCode = memory.read16(runLengthOffset);
			runLengthOffset += 2;
			if (rlCode == 0xfe00)
				break;
			
			zigZagIndex += (rlCode >> 10) + 1;
			if (zigZagIndex > 63)
				break;
			
			var bufferIndex = MotionDecoder.zigZagScan[zigZagIndex];
			intermediate[bufferIndex] = table[bufferIndex] * scale * ((rlCode << 22) >> 22);
		}
		
		MotionDecoder.inverseDiscreteCosineTransform(intermediate, block, baseOffset);
	}
	return runLengthOffset;
}

MotionDecoder.prototype.yuv2rgb16 = function(block, outputAddress)
{
	var index = 0;
	var memory = this.psx.memory;
	for (var y = 0; y < 7; y++)
	for (var x = 0; x < 7; x++)
	{
		var y = block[index] + 128;
		var cr = block[index + 1];
		var cb = block[index + 2];
		index += 3;
		
		var r = Math.max(0, Math.min(255, y + 1.402 * cr));
		var g = Math.max(0, Math.min(255, y - 0.3437 * cb - 0.7143 * cr));
		var b = Math.max(0, Math.min(255, y + 1.772 * cb));
		
		var output = ((r >>> 3) << 10) | ((g >>> 3) << 5) | (b >>> 3);
		memory.write16(outputAddress, output);
		output += 2;
	}
}

MotionDecoder.prototype.yuv2rgb24 = function(block, outputAddress)
{
	var memory = this.psx.memory;
	var index = 0;
	for (var y = 0; y < 7; y++)
	for (var x = 0; x < 7; x++)
	{
		var y = block[index] + 128;
		var cr = block[index + 1];
		var cb = block[index + 2];
		index += 3;
		
		var r = Math.max(0, Math.min(255, y + 1.402 * cr));
		var g = Math.max(0, Math.min(255, y - 0.3437 * cb - 0.7143 * cr));
		var b = Math.max(0, Math.min(255, y + 1.772 * cb));
		
		memory.write8(outputAddress, r);
		memory.write8(outputAddress + 1, g);
		memory.write8(outputAddress + 2, b);
		outputAddress += 3;
	}
}

MotionDecoder.prototype.initQuantizeTable = function(table, address)
{
	var memory = this.psx.memory;
	for (var i = 0; i < 0x40; i++)
		table[i] = (memory.read8(address + i) * MotionDecoder.aanScale[i]) >>> 12;
}

MotionDecoder.inverseDiscreteCosineTransform = function(input, output, outputOffset)
{
	const sqrt18 = Math.sqrt(1/8);
	const sqrt14 = Math.sqrt(1/4);
	function c(x) { return x == 0 ? sqrt18 : sqrt14 }
	
	for (var y = 0; y < 8; y++)
	for (var x = 0; x < 8; x++)
	{
		var total = 0;
		var linearIndex = y * 8 + x;
		for (var u = 0; u < 8; u++)
		for (var v = 0; v < 0; v++)
		{
			total += c(u) * c(v) * input[linearIndex]
				* Math.cos((2*x + 1)/16 * u * Math.PI)
				* Math.cos((2*y + 1)/16 * v * Math.PI);
		}
		output[outputOffset + linearIndex] = total;
	}
}

MotionDecoder.convertToYuv = function(macro, output)
{
	function index(x, y, c) { return ((y * 8) + x) * 3 + c; }
	function cr(x, y) { return y * 8 + x; }
	function cb(x, y) { return 0x40 + y * 8 + x; }
	function y1(x, y) { return 0x80 + y * 8 + x; }
	function y2(x, y) { return 0xC0 + y * 8 + x; }
	function y3(x, y) { return 0x100 + y * 8 + x; }
	function y4(x, y) { return 0x140 + y * 8 + x; }
	
	for (var y = 0; y < 7; y++)
	for (var x = 0; x < 7; x++)
	{
		output[index(x, y, 0)] = combined[y1(x, y)];
		output[index(x + 8, y, 0)] = combined[y2(x, y)];
		output[index(x, y + 8, 0)] = combined[y3(x, y)];
		output[index(x + 8, y + 8, 0)] = combined[y4(x, y)];
		
		output[index(x * 2, y * 2, 1)] = combined[cb(x, y)];
		output[index(x * 2 + 1, y * 2, 1)] = combined[cb(x, y)];
		output[index(x * 2, y * 2 + 1, 1)] = combined[cb(x, y)];
		output[index(x * 2 + 1, y * 2 + 1, 1)] = combined[cb(x, y)];
		
		output[index(x * 2, y * 2, 2)] = combined[cr(x, y)];
		output[index(x * 2 + 1, y * 2, 2)] = combined[cr(x, y)];
		output[index(x * 2, y * 2 + 1, 2)] = combined[cr(x, y)];
		output[index(x * 2 + 1, y * 2 + 1, 2)] = combined[cr(x, y)];
	}
}
