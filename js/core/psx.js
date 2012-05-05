var PSX = function(diags, webgl, bios, controller1StateArray, controller2StateArray)
{
	this.diags = diags;
	this.bios = new GeneralPurposeBuffer(bios);
	this.parallelPort = new ParallelPortMemoryRange(this);
	
	this.cpu = new R3000a(this);
	this.mdec = new MotionDecoder(this);
	this.gpu = new GPU(this, webgl);
	this.hardwareRegisters = new HardwareRegisters(this, this.mdec, this.gpu);
	this.memory = new MemoryMap(this, this.hardwareRegisters, this.parallelPort, this.bios);
}

PSX.prototype.reset = function()
{
	this.pc = R3000a.bootAddress;
	this.cpu.reset();
	this.mdec.reset();
	this.gpu.reset();
	this.memory.reset();
}

PSX.prototype.runFrame = function()
{
	
}