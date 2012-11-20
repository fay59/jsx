// based on zodttd's psx4all newGPU

var GPU = function(psx, glContext)
{
	this.psx = psx;
	this.gl = glContext;
	
	this.reset();
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

GPU.prototype.reset = function()
{
	// GPU API
	this.GP1 = 0;
	this.frameBuffer = new ArrayBuffer(0x400 * 0x200 * 2);
	
	// tweaks & hacks
	this.hacks = {
		skipCount: 0,
		skipRate: 0,
		enableFrameLimit: false,
		enableAbbeyHack: false,
		displayFrameInfo: false,
		displayGpuStats: false,
		primitiveDebugMode: false,
		activeNullGpu: false,
		activeGpuLog: false
	};
	
	// interlacing
	this.linesInterlace = 0;
	this.linesInterace_user = 0;
	
	// DMA transfer
	this.px = 0;
	this.py = 0;
	this.x_start = 0;
	this.y_start = 0;
	this.x_end = 0;
	this.y_end = 0;
	
	this.frameToRead = 0;
	this.frameToWrite = 0;
	this.frameCount = 0;
	this.frameIndex = 0;
	
	this.gp0 = 0;
	this.otherEnv = new Uint32Array(16);
	this.packetCount = 0;
	this.packetIndex = 0;
	
	// statistics & timing
	this.systime = 0;
	this.isSkip = 0;
	this.skipFrame = 0;
	this.vsyncRateCounter = 0;
	this.frameRateCounter = 0;
	this.frameRealCounter = 0;
	this.vsyncRate = 60;
	this.frameRate = 60;
	this.realRate = 60;
	this.framesTotal = 0;
	
	this.statF3 = 0;
	this.statFT3 = 0;
	this.statG3 = 0;
	this.statGT3 = 0;
	this.statLF = 0;
	this.statLG = 0;
	this.statS = 0;
	this.statT = 0;
	
	this.gpuPolyTime = 0;
	this.gpuPolyCount = 0;
	this.gpuRasterTime = 0;
	this.gpuRasterCount = 0;
	this.gpuPixelTime = 0;
	this.gpuPixelCount = 0;
	this.dmaChainTime = 0;
	this.dmaChainCount = 0;
	this.dmaMemTime = 0;
	this.dmaMemCount = 0;
	this.dmaPacketTime = new Uint32Array(0x100);
	this.dmaPacketCount = new Uint32Array(0x100);
	
	// display status
	this.__defineGetter__("isPAL", function() {
		return this.psx.emulatedSystem == PSX.PAL;
	});
	
	// display status
	this.isDisplaySet = 0;
	this.displayArea = new Uint32Array(8);
	this.dirtyArea = new Uint32Array(4);
	this.lastDirtyArea = new Uint32Array(4);
	this.checkArea = new Uint32Array(4);
	
	// rasterizer status
	this.textureWindow = new Uint32Array(4);
	this.drawingArea = new Uint32Array(4);
	this.drawingOffset = new Uint32Array(2);
	this.maskU = 0;
	this.maskV = 0;
	
	this.masking = 0;
	this.pixelMSB = 0;
	
	// offset from frameBuffer
	this.tba = null;
	this.cba = null;
	this.ta = null;
	
	this.blendMode = 0;
	this.textMode = 0;
	
	this.pixel = 
}

GPU.prototype.readStatusRegister = function()
{
}

GPU.prototype.writeStatusRegister = function(data)
{
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
