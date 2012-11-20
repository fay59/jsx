// inspired from pcsx-reARMed's gpu-gles plugin,
// in turn inspired from pcsx4m's gpu-gles plugin,
// in turn inspired from something Pete Bernert made but it's not the OpenGL
//	plugin...
// did these guys get ahold of the OpenGL2 plugin source code?

// anyways
// this is pretty much a dumb port from C to Javascript,
//	minus the global variables.

var BitfieldBuilder = function(valueName)
{
	var bitfield = {};
	bitfield[valueName] = 0;
	
	var finalized = false;
	var nextBits = 0;
	const allOnes = 0xffffffff;
	
	this.addField = function(name, bits)
	{
		if (finalized)
			throw new Error("cannot build up a finalized bitfield");
		
		if (nextBits + bits > 32)
			throw new Error("only 32-bits bitfields are supported");
		
		const bitShift = nextBits;
		const bitMask = (1 << bits) - 1;
		bitfield.__defineGetter__(name, function()
		{
			return (bitfield[valueName] >>> bitShift) & bitMask;
		});
		
		const shiftedMask = bitMask << bitShift;
		const setBitMask = allOnes & ~shiftedMask;
		bitfield.__defineSetter__(name, function(value)
		{
			bitfield[valueName] &= setBitMask;
			bitfield[valueName] |= value & shiftedMask;
		});
		
		nextBits += bits;
	}
	
	this.finalize = function()
	{
		finalized = true;
		return bitfield;
	}
}

var Matrix = {
	identity: function(size)
	{
		var matrix = new Float32Array(size * size);
		var oneIndex = 0;
		for (var i = 0; i < size; i++)
		{
			matrix[i * size + oneIndex] = 1;
			oneIndex++;
		}
		return matrix;
	}
};

var GPU = function(psx, gl)
{
	this.psx = psx;
	this.gl = gl;
	
	var statusReg = new BitfieldBuilder("reg");
	statusReg.addField("tx", 4);
	statusReg.addField("ty", 1);
	statusReg.addField("abr", 2);
	statusReg.addField("tp", 2);
	statusReg.addField("dtd", 1);
	statusReg.addField("dfe", 1);
	statusReg.addField("md", 1);
	statusReg.addField("me", 1);
	statusReg.addField("unkn", 3);
	statusReg.addField("width1", 1);
	statusReg.addField("width0", 2);
	statusReg.addField("dheight", 1);
	statusReg.addField("video", 1);
	statusReg.addField("rbg24", 1);
	statusReg.addField("interlace", 1);
	statusReg.addField("blanking", 1);
	statusReg.addField("unkn2", 2);
	statusReg.addField("busy", 1);
	statusReg.addField("img", 1);
	statusReg.addField("com", 1);
	statusReg.addField("dma", 2);
	statusReg.addField("lcf", 1);
	this.status = statusReg.finalize();
}

GPU.prototype.reset = function()
{
	this.status.reg = 0x14802000;
}

GPU.prototype.install = function(hwregs)
{
	hwregs.wire(0x1f801810,
		this.readDataRegister.bind(this),
		this.writeDataRegister.bind(this)
	);
	
	hwregs.wire(0x1f801814,
		this.readStatusRegister.bind(this),
		this.writeStatusRegister.bind(this)
	);
}

GPU.prototype.readStatusRegister = function()
{
	return this.status.reg;
}

GPU.prototype.writeStatusRegister = function(data)
{
	const command = (value >>> 24) & 0xff;
	switch (command)
	{
	case 0x00: // reset GPU, turns of the screen
		break;
	
	case 0x01: // reset command buffer
		break;
	
	case 0x02: // reset irq, whatever that means
		break;
	
	case 0x03: // set display enabled/disabled
		break;
	
	case 0x04: // dma setup
		break;
	
	case 0x05: // start display
		break;
	
	case 0x06: // horizontal display range
		break;
	
	case 0x07: // vertical display range
		break;
	
	case 0x08: // display mode
		break;
	
	case 0x09: // ???
		break;
	
	case 0x10: // GPU info
		break;
	
	case 0x20: // ???
		break;
	}
}

GPU.prototype.readDataRegister = function()
{
}

GPU.prototype.writeDataRegister = function(value)
{
}

GPU.prototype.dmaChain = function(buffer, offset)
{
}

GPU.prototype.writeDataMem = function(buffer, offset, count)
{
}

GPU.prototype.readDataMem = function(buffer, offset, count)
{
}

GPU.prototype.vsync = function()
{
}