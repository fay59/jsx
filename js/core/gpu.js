// based on Duddie's GPU plugin for PSEPro
// Thank you, Duddie, for making the only almost-intelligible Playstation GPU plugin.

var GPU = function(psx, glContext)
{
	this.psx = psx;
	this.gl = glContext;
	
	this.statusRegValue = 0;
	this.dataRegValue = 0
	this.data = new Uint32Array(100);
	this.command = 0;
	this.dataWriteCount = 0;
	this.dataWriteIndex = 0;
	this.lineOddOrEven = false;
	this.imageTransfer = 0;
	
	this.vram = new ArrayBuffer(1024 * 520 * 2);
	this.u8 = new Uint8Array(this.vram);
	this.s8 = new Int8Array(this.vram);
	this.u16 = new Uint16Array(this.vram);
	this.s16 = new Int16Array(this.vram);
	this.u32 = new Uint32Array(this.vram);
	this.s32 = new Int32Array(this.vram);
	
	// rendering stuff
	this.gM1 = 255;
	this.gM2 = 255;
	this.gM3 = 255;
	this.drawSemiTransparent = false;
	this.yMin = 0;
	this.yMax = 0;
	this.ly0 = 0;
	this.lx0 = 0;
	this.ly1 = 0;
	this.lx1 = 0;
	this.ly2 = 0;
	this.lx2 = 0;
	this.ly3 = 0;
	this.lx3 = 0;
	this.globalTextureAddrX = 0;
	this.globalTextureAddrY = 0;
	this.globalTextureTP = 0;
	this.globalTextureABR = 0;
	
	// zn interface
	this.gpuVersion = 0;
	this.gpuHeight = 512;
	this.gpuHeightMask = 511;
	this.globalTextureIL = 0;
	this.tileCheat = 0;
	
	// primitives stuff
	this.drawTextured = false;
	this.drawSmoothShaded = false;
	this.oldSmoothShaded = false;
	this.drawNonShaded = false;
	this.drawMultiPass = false;
	this.offscreenDrawing = 0;
	this.drawnSomething = 0;
	
	this.renderToFrontBuffer = false;
	this.globalTextureAlpha = 0;
	this.globalColorAlpha = 0;
	this.filterType = 0;
	this.fullVRAM = false
	this.drawDither = false;
	this.useMultiPass = false;
	this.textureName = 0;
	this.textureEnabled = false;
	this.blendEnabled = false;
	this.uploadArea = {x: 0, y: 0, width: 0, height: 0};
	this.uploadAreaIL = {x: 0, y: 0, width: 0, height: 0};
	this.uploadAreaRGB24 = {x: 0, y: 0, width: 0, height: 0};
	this.spriteTexture = false;
	this.mirror = 0;
	this.needUploadAfter = false;
	this.needUploadTest = false;
	this.usingTWin = false;
	this.usingMovie = false;
	this.movieArea = {x: 0, y: 0, width: 0, height: 0};
	this.spriteAjust_ux2 = 0;
	this.spriteAjust_vy2 = 0;
	this.oldColor = 0;
	this.clutID = 0;
	this.cfgFixes = 0;
	this.actFixes = 0;
	this.emuFixes = 0;
	this.useFixes = false;
	this.drawX = 0;
	this.drawY = 0;
	this.drawWidth = 0;
	this.drawHeight = 0;
	this.sxMin = 0;
	this.sxMax = 0;
	this.syMin = 0;
	this.syMax = 0;
	
	this.display = {
		x: 0,
		y: 0,
		width: 0,
		height: 0,
		trueColor: false,
		lace: false,
	};
	
	this.newDisplay = {
		x: 0,
		y: 0,
		width: 0,
		height: 0,
		trueColor: false,
		lace: false,
	};
	
	this.reset();
}

GPU.bgr2rgb = new Uint16Array(0x10000);
GPU.displayWidths = [256, 320, 512, 640];
GPU.primitiveSizeTable = new Uint8Array([
	// 00
	0,0,3,0,0,0,0,0,
	// 08
	0,0,0,0,0,0,0,0,
	// 10
	0,0,0,0,0,0,0,0,
	// 18
	0,0,0,0,0,0,0,0,
	// 20
	4,4,4,4,7,7,7,7,
	// 28
	5,5,5,5,9,9,9,9,
	// 30
	6,6,6,6,9,9,9,9,
	// 38
	8,8,8,8,12,12,12,12,
	// 40
	3,3,3,3,0,0,0,0,
	// 48
	5,5,5,5,6,6,6,6,
	// 50
	4,4,4,4,0,0,0,0,
	// 58
	7,7,7,7,9,9,9,9,	//	LINEG3	LINEG4
	// 60
	3,3,3,3,4,4,4,4,	//	TILE	SPRT
	// 68
	2,2,2,2,0,0,0,0,	//	TILE1
	// 70
	2,2,2,2,3,3,3,3,
	// 78
	2,2,2,2,3,3,3,3,
	// 80
	4,0,0,0,0,0,0,0,
	// 88
	0,0,0,0,0,0,0,0,
	// 90
	0,0,0,0,0,0,0,0,
	// 98
	0,0,0,0,0,0,0,0,
	// a0
	3,0,0,0,0,0,0,0,
	// a8
	0,0,0,0,0,0,0,0,
	// b0
	0,0,0,0,0,0,0,0,
	// b8
	0,0,0,0,0,0,0,0,
	// c0
	3,0,0,0,0,0,0,0,
	// c8
	0,0,0,0,0,0,0,0,
	// d0
	0,0,0,0,0,0,0,0,
	// d8
	0,0,0,0,0,0,0,0,
	// e0
	0,1,1,1,1,1,1,0,
	// e8
	0,0,0,0,0,0,0,0,
	// f0
	0,0,0,0,0,0,0,0,
	// f8
	0,0,0,0,0,0,0,0
]);
GPU.primitiveCallTable = [];

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

GPU.prototype.reset = function()
{
	this.statusRegValue = 0x74000000;
	this.lineOddOrEven = true;
	
	for (var i = 0; i < this.u32.length; i++)
		this.u32[i] = 0;
	
	for (var i = 0; i < this.data.length; i++)
		this.data[i] = 0;
	
	with (this.display)
	{
		width = 0;
		height = 0;
	}
}

GPU.prototype.updateLace = function()
{
	with (this.display)
	{
		if (lace)
		{
			this.lineOddOrEven = !this.lineOddOrEven;
			if (width > 0 && height > 0)
				this.updateDisplay();
		}
	}
}

GPU.prototype.updateDisplay = function()
{
	// swap buffers
	// done by the browser automagically
}

GPU.prototype.updateDisplayIfChanged = function()
{
	with (this)
	{
		if (display.width == newDisplay.width && display.height == newDisplay.height)
			return;
	}
	
	with (this.gl)
	{
		clearColor(0, 0, 0, 1);
		enable(DEPTH_TEST);
		depthFunction(LEQUAL);
		clear(COLOR_BUFFER_BIT | DEPTH_BUFFER_BIT);
	}
	
	for (var key in this.display)
		this.display[key] = this.newDisplay[key];
	this.updateDisplay();
}

GPU.prototype.readStatusRegister = function()
{
	// (x << 30) * 2 to remain unsigned
	return this.statusRegValue | ((this.lineOddOrEven << 30) * 2);
}

GPU.prototype.writeStatusRegister = function(data)
{
	var command = (data >>> 24) & 0xff;
	switch (command)
	{
	case 0x00: // reset
		this.psx.diags.warn("Implement the GPU.writeStatusRegister 'reset' case");
		return;
	
	case 0x03: // enable/disable display
		this.psx.diags.warn("Implement the GPU.writeStatusRegister 'enable/disable display' case");
		return;
	
	case 0x04: // set transfer mode
		var transferMode = data & 0xffffff;
		if (transferMode == 0)
			this.imageTransfer = 0;
		else if (transferMode == 2)
			this.imageTransfer = 3;
		return;
	
	case 0x05: // set display portion
		this.display.y = (data >>> 10) & 0x3ff;
		this.display.x = data & 0x3ff;
		if (!this.display.lace)
			this.updateDisplay();
		return;
	
	case 0x06: // set width
		this.psx.diags.warn("Implement the GPU.writeStatusRegister 'set width' case");
		return;
	
	case 0x07: // set height
		this.psx.diags.warn("Implement the GPU.writeStatusRegister 'set height' case");
		return;
	
	case 0x08: // set display infos
		this.newDisplay.width = GPU.displayWidths[data & 0x3];
		if (data & 0x40)
		{
			if (this.newDisplay.width == 320)
				this.newDisplay.width = 384;
			else if (this.newDisplay.width == 256)
				this.newDisplay.width = 352;
		}
		
		if (data & 4)
			this.newDisplay.height = 480;
		else
			this.newDisplay.height = 240;
		
		this.newDisplay.trueColor = (data >> 4) & 1; // 1 = true color
		this.newDisplay.lace = (data >> 5) & 1; // 1 = interlace
		// drawLace ?
		this.updateDisplayIfChanged();
		return;
	
	case 0x10: // get GPU infos
		this.dataRegValue = 2; // return GPU version = 2
		return;
	
	default:
		this.psx.diags.error("GPU.writeStatusRegister: unknown command 0x%08x", command);
		return;
	}
}

GPU.prototype.readDataRegister = function()
{
	if (this.imageTransfer == 2)
	{
		// transfer image from vram
		this.psx.diags.warn("Implement transfering stuff from the VRAM");
	}
	
	return this.dataRegValue;
}

GPU.prototype.writeDataRegister = function(value)
{
	this.dataRegValue = value;
	if (this.imageTransfer & 1)
	{
		// transfer to VRAM
		this.psx.diags.warn("Implement transfering stuff to the VRAM");
	}
	
	if (this.dataWriteCount == 0)
	{
		var command = (value >> 24) & 0xff;
		if (GPU.primitiveSizeTable[command])
		{
			this.dataWriteCount = GPU.primitiveSizeTable[command];
			this.command = command;
			this.data[0] = value;
			this.dataWriteIndex = 1;
		}
		else
		{
			if (value)
				this.psx.diags.warn("Unknown command 0x%08x (data 0x%08x)", command, value);
			return;
		}
	}
	else
	{
		this.data[this.dataWriteIndex] = value;
		this.dataWriteIndex++;
	}
	
	if (this.dataWriteIndex == this.dataWriteCount)
	{
		this.dataWriteIndex = 0;
		this.dataWriteCount = 0;
		GPU.primitiveCallTable[this.command].call(this, this.data, 0);
	}
}

GPU.prototype.dmaChain = function(baseAddress, offset)
{
	var memory = this.psx.memory;
	do
	{
		var count = this.memory.read8(baseAddress + offset + 3);
		var dmaMemOffset = baseAddress + offset + 4;
		while (count)
		{
			var command = this.memory.read8(dmaMemOffset + 3);
			var size = GPU.primitiveSizeTable[command];
			if (size == 0)
			{
				this.psx.diags.warn("Unknown command 0x%08x in DMA chain", command);
				dmaMemOffset += 4;
				count--;
			}
			else
			{
				var translate = this.memory.translate(dmaMemOffset);
				GPU.primitiveCallTable[command].call(this, translate.buffer, translate.offset);
				dmaMemOffset += 4 * size;
				count -= size;
			}
		}
		
		offset = this.memory.read32(baseAddress + offset) & 0xffffff;
		if (offset <= 0 || offset == 0xffffff)
			break;
		
		offset &= 0x7fffff;
	}
	while (true);
}

// static initialization
;
(function()
{
	for (var i = 0; i < GPU.bgr2rgb.length; i++)
	{
		GPU.bgr2rgb[i] = (i & 0x8000) | ((i & 0x7c00) >> 10) | (i & 0x03e0) | ((i & 0x1f) << 10);
	}
	
	GPU.prototype.updateGlobalTexturePage = function(data)
	{
		this.globalTextureAddrX = (data << 6) & 0x3c0;
		if (this.gpuHeight == 1024)
		{
			if (this.gpuVersion == 2)
			{
				this.globalTextureAddrY = (data & 0x60) << 3;
				this.globalTextureIL = (data & 0x2000) >>> 13;
				this.globalTextureABR = (data >>> 7) & 0x3;
				this.globalTextureTP = (data >> 9) & 0x3;
				if (this.globalTextureTP == 3)
					this.globalTextureTP = 2;
				this.globalTexturePage = (this.globalTextureAddrY >>> 6) + (this.globalTextureAddrX >>> 4);
				this.mirror = 0;
				this.statusRegValue = (this.statusRegValue & 0xffffe000) | (data & 0x1fff);
				return;
			}
			else
			{
				this.globalTextureAddrY = ((data << 4) & 0x100) | ((data >>> 2) & 0x200);
			}
		}
		else
			this.globalTextureAddrY = (data << 4) & 0x100;
		
		this.mirror = data & 0x3000;
		this.globalTexturePage = (this.globalTextureAddrY >>> 6) + (this.globalTextureAddrX >>> 4);
		this.globalTextureABR = (data >>> 5) & 0x03;
		this.globalTextureTP = (data >>> 6) & 0x3;
		if (this.globalTextureTP == 3)
			this.globalTextureTP = 2;
		
		this.statusRegValue = (this.statusRegValue & ~0x07ff) | (data & 0x07ff);
	}
	
	// commands
	var primNI = function()
	{
		this.psx.diags.error("unknown primitive");
	}
	
	var primBlkFill = function()
	{
		this.psx.diags.error("unknown primitive primBlkFill");
	}
	
	var primPolyF3 = function()
	{
		this.psx.diags.error("unknown primitive primPolyF3");
	}
	
	var primPolyFT3 = function()
	{
		this.psx.diags.error("unknown primitive primPolyFT3");
	}
	
	var primPolyF4 = function()
	{
		this.psx.diags.error("unknown primitive primPolyF4");
	}
	
	var primPolyFT4 = function()
	{
		this.psx.diags.error("unknown primitive primPolyFT4");
	}
	
	var primPolyG3 = function()
	{
		this.psx.diags.error("unknown primitive primPolyG3");
	}
	
	var primPolyGT3 = function()
	{
		this.psx.diags.error("unknown primitive primPolyGT3");
	}
	
	var primPolyG4 = function()
	{
		this.psx.diags.error("unknown primitive primPolyG4");
	}
	
	var primPolyGT4 = function()
	{
		this.psx.diags.error("unknown primitive primPolyGT4");
	}
	
	var primLineF2 = function()
	{
		this.psx.diags.error("unknown primitive primLineF2");
	}
	
	var primTileS = function()
	{
		this.psx.diags.error("unknown primitive primTileS");
	}
	
	var primSprtS = function()
	{
		this.psx.diags.error("unknown primitive primSprtS");
	}
	
	var primSprt8 = function()
	{
		this.psx.diags.error("unknown primitive primSprt8");
	}
	
	var primSprt16 = function()
	{
		this.psx.diags.error("unknown primitive primSprt16");
	}
	
	var primMoveImage = function()
	{
		this.psx.diags.error("unknown primitive primMoveImage");
	}
	
	var primLoadImage = function()
	{
		this.psx.diags.error("unknown primitive primLoadImage");
	}
	
	var primStoreImage = function()
	{
		this.psx.diags.error("unknown primitive primStoreImage");
	}
	
	var cmdTexturePage = function(data)
	{
		this.updateGlobalTexturePage(data[0] & 0xffff);
	}
	
	var cmdTextureWindow = function()
	{
		this.psx.diags.error("unknown primitive cmdTextureWindow");
	}
	
	var cmdDrawAreaStart = function()
	{
		this.psx.diags.error("unknown primitive cmdDrawAreaStart");
	}
	
	var cmdDrawAreaEnd = function()
	{
		this.psx.diags.error("unknown primitive cmdDrawAreaEnd");
	}
	
	var cmdDrawAreaStart = function()
	{
		this.psx.diags.error("unknown primitive cmdDrawAreaStart");
	}
	
	var cmdDrawOffset = function()
	{
		this.psx.diags.error("unknown primitive cmdDrawOffset");
	}
	
	var cmdSTP = function()
	{
		this.psx.diags.error("unknown primitive cmdSTP");
	}
	
	GPU.primitiveCallTable = [
		primNI, primNI, primBlkFill, primNI, primNI, primNI, primNI, primNI,  // 00
		primNI, primNI, primNI, primNI, primNI, primNI, primNI, primNI,  // 08
		primNI, primNI, primNI, primNI, primNI, primNI, primNI, primNI,  // 10
		primNI, primNI, primNI, primNI, primNI, primNI, primNI, primNI,  // 18
		primPolyF3, primPolyF3, primPolyF3, primPolyF3, primPolyFT3, primPolyFT3, primPolyFT3, primPolyFT3,  // 20
		primPolyF4, primPolyF4, primPolyF4, primPolyF4, primPolyFT4, primPolyFT4, primPolyFT4, primPolyFT4,  // 28
		primPolyG3, primPolyG3, primPolyG3, primPolyG3, primPolyGT3, primPolyGT3, primPolyGT3, primPolyGT3,  // 30
		primPolyG4, primPolyG4, primPolyG4, primPolyG4, primPolyGT4, primPolyGT4, primPolyGT4, primPolyGT4,  // 38
		primLineF2, primLineF2, primLineF2, primLineF2, primNI, primNI, primNI, primNI,  // 40
		primNI, primNI, primNI, primNI, primNI, primNI, primNI, primNI,  // 48
		primNI, primNI, primNI, primNI, primNI, primNI, primNI, primNI,  // 50
		primNI, primNI, primNI, primNI, primNI, primNI, primNI, primNI,  // 58
		primTileS, primNI, primNI, primNI, primSprtS, primSprtS, primSprtS, primSprtS,  // 60
		primNI, primNI, primNI, primNI, primNI, primNI, primNI, primNI,  // 68
		primNI, primNI, primNI, primNI, primSprt8, primSprt8, primSprt8, primSprt8,  // 70
		primNI, primNI, primNI, primNI, primSprt16, primSprt16, primSprt16, primSprt16,  // 78
		primMoveImage, primNI, primNI, primNI, primNI, primNI, primNI, primNI,  // 80
		primNI, primNI, primNI, primNI, primNI, primNI, primNI, primNI,  // 88
		primNI, primNI, primNI, primNI, primNI, primNI, primNI, primNI,  // 90
		primNI, primNI, primNI, primNI, primNI, primNI, primNI, primNI,  // 98
		primLoadImage, primNI, primNI, primNI, primNI, primNI, primNI, primNI,  // a0
		primNI, primNI, primNI, primNI, primNI, primNI, primNI, primNI,  // a8
		primNI, primNI, primNI, primNI, primNI, primNI, primNI, primNI,  // b0
		primNI, primNI, primNI, primNI, primNI, primNI, primNI, primNI,  // b8
		primStoreImage, primNI, primNI, primNI, primNI, primNI, primNI, primNI,  // c0
		primNI, primNI, primNI, primNI, primNI, primNI, primNI, primNI,  // c8
		primNI, primNI, primNI, primNI, primNI, primNI, primNI, primNI,  // d0
		primNI, primNI, primNI, primNI, primNI, primNI, primNI, primNI,  // d8
		primNI, cmdTexturePage, cmdTextureWindow, cmdDrawAreaStart, cmdDrawAreaEnd, cmdDrawOffset, cmdSTP, primNI,  // e0
		primNI, primNI, primNI, primNI, primNI, primNI, primNI, primNI,  // e8
		primNI, primNI, primNI, primNI, primNI, primNI, primNI, primNI,  // f0
		primNI, primNI, primNI, primNI, primNI, primNI, primNI, primNI // f8
	];
})();
