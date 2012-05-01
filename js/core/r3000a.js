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

var R3000a = function()
{
	this.stopped = false;
	this.memory = null;
	this.ticks = 0;
	
	this.diags = console;
	
	// GPRs, COP0 registers, COP2 data registers, COP2 control registers
	this.registerMemory = new ArrayBuffer((34 * 4) + (16 * 4) + (32 * 4) + (32 * 4));
	
	// hi, lo in 32, 33 respectively
	this.gpr = new Uint32Array(this.registerMemory, 0, 34); // general purpose registers
	this.cop0_reg = new Uint32Array(this.registerMemory, 34 * 4, 16); // status registers
	
	// no fancy structures like PCSX has because nothing uses them
	this.cop2_data = new Uint32Array(this.registerMemory, (34 + 16) * 4, 32);
	this.cop2_ctl = new Uint32Array(this.registerMemory, (34 + 16 + 32) * 4, 32);
}

R3000a.bootAddress = 0xbfc00000;

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

R3000a.prototype.setDiagnosticsOutput = function(diags)
{
	this.diags = diags;
	if (this.memory != null)
		this.memory.diags = diags;
}

R3000a.prototype.panic = function(message, pc)
{
	this.stopped = true;
	throw new ExecutionException(message, pc);
}

// to use from the WebKit debugger when something goes terribly wrong
R3000a.prototype.__crash = function()
{
	this.diags.error("crashing the PSX engine");
	// this should do it
	this.gpr = null;
	this.fgr = null;
	this.cop0_reg = null;
	this.memory = null;
}

R3000a.prototype.stop = function()
{
	this.stopped = true;
}

R3000a.prototype.reset = function(memory)
{
	this.memory = memory;
	this.memory.diags = this.diags;
	this.memory.reset();
	
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
	this.cop0_reg[12] = 0x00400002;
	this.cop0_reg[15] = 0x00000230;
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
	
	this.diags.log("Writing " + value.toString(16) + " to " + Disassembler.cop0RegisterNames[reg]);
	
	switch (reg)
	{
		case 12: // SR
		{
			// IsC
			if ((oldValue & R3000a.srFlags.IsC) && !(value & R3000a.srFlags.IsC))
				this.memory = this.memory.hidden;
			else if (!(oldValue & R3000a.srFlags.IsC) && (value & R3000a.srFlags.IsC))
				this.memory = new MemoryCache(this.memory);
			
			break;
		}
	}
}

R3000a.prototype.clock = function(ticks)
{
	this.ticks += ticks;
	if (this.ticks >= 10000000)
	{
		this.diags.log("10000000 ticks");
		this.ticks = 0;
	}
}

R3000a.prototype.run = function(pc, context)
{
	if (pc === undefined)
		pc = R3000a.bootAddress;
	
	while (true)
	{
		var newAddress = this.executeBlock(pc, context);
		pc = newAddress;
	}
}

R3000a.prototype.executeBlock = function(address, context)
{
	this.stopped = false;
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
	multiplyUnsigned: function(gpr, a, b)
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
