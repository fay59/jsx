var ExecutionException = function(message, pc, cause)
{
	this.message = message;
	this.pc = pc;
	this.cause = cause;
}

ExecutionException.prototype.toString = function()
{
	if (this.cause !== undefined)
		return this.message + " (" + this.cause.toString() + ")";
	return this.message;
}

var R3000a = function(psx)
{
	this.psx = psx;
	this.yields = 0;
	this.shouldYield = false;
	this.memory = null;
	this.cycles = 0;
	
	// hi, lo in 32, 33 respectively
	this.cop0_reg = new Uint32Array(16); // status registers
	this.gpr = new Uint32Array(34); // general purpose registers
	
	// no fancy structures like PCSX has because nothing uses them
	this.cop2_data = new Uint32Array(32);
	this.cop2_ctl = new Uint32Array(32);
}

R3000a.bootAddress = 0xbfc00000;
R3000a.cyclesPerSecond = 33868800;

R3000a.exceptions = {
	reset: -1, // no matching bit in the Cause register
	interrupt: 0,
	tlbModified: 1,
	tlbLoadMiss: 2,
	tlbStoreMiss: 3,
	addressLoadError: 4,
	addressStoreError: 5,
	instructionBusError: 6,
	dataBusError: 7,
	syscall: 8,
	breakpoint: 9,
	reservedInstruction: 10,
	coprocessorUnusable: 11,
	overflow: 12,
};

R3000a.srFlags = {
	IEc: 1,
	KUc: 1 << 1,
	IEp: 1 << 2,
	KUp: 1 << 3,
	IEo: 1 << 4,
	KUo: 1 << 5,
	IntMask: 0xF0,
	IsC: 1 << 16,
	SwC: 1 << 17,
	PZ: 1 << 18,
	CM: 1 << 19,
	PE: 1 << 20,
	TS: 1 << 21,
	BEV: 1 << 22,
	RE: 1 << 24,
	CU: 0xF0000000
};

R3000a.prototype.panic = function(message, pc)
{
	throw new ExecutionException(message, pc);
}

// to use from the WebKit debugger when something goes terribly wrong
R3000a.prototype.__crash = function()
{
	this.psx.diags.error("crashing the PSX engine");
	// this should do it
	this.gpr = null;
	this.fgr = null;
	this.cop0_reg = null;
	this.memory = null;
}

R3000a.prototype.yield = function()
{
	this.shouldYield = true;
	this.yields++;
}

R3000a.prototype.reset = function()
{
	this.memory = this.psx.memory;
	
	for (var i = 0; i < 32; i++)
	{
		this.gpr[i] = 0;
		this.cop2_ctl[i] = 0;
		this.cop2_data[i] = 0;
	}
	
	// hi, lo
	this.gpr[32] = 0;
	this.gpr[33] = 0;
	
	// values taken from pSX's debugger at reset
	this.cop0_reg[12] = 0x10900000;
	this.cop0_reg[15] = 0x00000002;
}

R3000a.prototype.checkInterrupts = function(epc)
{
	if ((this.cop0_reg[12] & 0x401) == 0x401)
	{
		// directly read through the hardwareRegisters interface to avoid the function calls
		var irqs = this.psx.hardwareRegisters.u32[0x70 >> 2]; // 0x1f801070
		var mask = this.psx.hardwareRegisters.u32[0x74 >> 2]; // 0x1f801074
		if (irqs & mask)
			return this.raiseException(epc, 0x400, false);
	}
}

R3000a.prototype.raiseException = function(epc, exception, inDelaySlot)
{
	this.cop0_reg[13] = exception;
	this.cop0_reg[14] = epc;
	
	if (inDelaySlot)
	{
		this.cop0_reg[13] |= 0x80000000;
		this.cop0_reg[14] -= 4;
	}
	
	this.cop0_reg[12] = (this.cop0_reg[12] & ~0x3f) | ((this.cop0_reg[12] & 0xf) << 2);
	
	var handlerAddress = (this.cop0_reg[12] & 0x400000) == 0x400000
		? 0xbfc00180 : 0x80000080;
	
	return handlerAddress;
}

R3000a.prototype.writeCOP0 = function(reg, value)
{
	var oldValue = this.cop0_reg[reg];
	this.cop0_reg[reg] = value;
	
	// this.psx.diags.log("Writing 0x%08x to %s", value, Disassembler.cop0RegisterNames[reg]);
	
	switch (reg)
	{
	case 12: // SR
		// IsC
		if ((oldValue & R3000a.srFlags.IsC) && !(value & R3000a.srFlags.IsC))
			this.memory = this.memory.hidden;
		else if (!(oldValue & R3000a.srFlags.IsC) && (value & R3000a.srFlags.IsC))
			this.memory = new MemoryCache(this.memory);
		
		break;
	}
}

R3000a.prototype.clock = function(ticks)
{
	// PCSX doubles the cycle count for reasons unknown to me, but they're
	// probably right
	const bias = 2;
	
	this.cycles += ticks * bias;
	var lastBit = this.cycles & 1;
	this.cycles = (this.cycles >>> 1) * 2 + lastBit;
	
	this.psx.hardwareRegisters.update();
	
	if (this.cycles == 0x24c4b2e)
		console.log("Hit 24c4a7c");
}

R3000a.prototype.run = function(pc, context)
{
	if (pc === undefined)
		pc = R3000a.bootAddress;
	
	while (!this.shouldYield)
	{
		var newAddress = this.executeBlock(pc, context);
		pc = newAddress;
	}
	
	this.shouldYield = false;
	return pc;
}

var calls = "";
R3000a.prototype.executeBlock = function(address, context)
{
	calls += address + " à " + this.cycles + "\n";
	if (this.cycles > 0x24c4fff)
		this.__crash();
	return this.memory.compiled.invoke(this, address, context);
}

R3000a.prototype.executeOne = function(address, context)
{
	return this.memory.compiled.executeOne(this, address, context);
}

R3000a.prototype.invalidate = function(address)
{
	this.memory.compiled.invalidate(address);
}

R3000a.runtime = {
	multu: function(gpr, a, b)
	{
		// HI: gpr[32], LO: gpr[33]
		var c0 = (a & 0xffff) * (b & 0xffff);
		var c16a = (a & 0xffff) * (b >>> 16);
		var c16b = (a >>> 16) * (b & 0xffff);
		var c32 = (a >>> 16) * (b >>> 16);

		var d16 = (c0 >>> 16) + (c16a & 0xFFFF) + (c16b & 0xffff);
		var d32 = (d16 >>> 16) + (c16a >>> 16) + (c16b >>> 16) + (c32 & 0xffff);
		var d48 = (d32 >>> 16) + (c32 >>> 16);
		
		gpr[33] = (c0 & 0xFFFF) | ((d16 & 0xFFFF) << 16);
		gpr[32] = (d32 & 0xFFFF) | ((d48 & 0xFFFF) << 16);
	},
	
	lwl: function(gpr, memory, outputReg, address)
	{
		var shift = (address & 3) * 8;
		var mask = ~(shift - 1);
		var word = memory.read32(address) << shift;
		gpr[outputReg] = (gpr[outputReg] & mask) | word;
	}
}
