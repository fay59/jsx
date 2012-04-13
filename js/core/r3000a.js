var YieldControl = function(resumeFunctionAddress, resumePC)
{
	if (!isFinite(resumeFunctionAddress) || !isFinite(resumePC))
		throw new Error("non-numeric resume address");
	
	this.resumeFunctionAddress = resumeFunctionAddress;
	this.resumePC = resumePC;
	this.message = "resume execution at 0x" + resumeFunctionAddress.toString(16)
		+ "(" + resumePC.toString(16) + ")";
}

var R3000a = function()
{
	this.stopped = false;
	this.memory = null;
	this.recompiler = new Recompiler();
	
	this.diags = console;
	
	// GPRs, COP0 registers, COP2 data registers, COP2 control registers
	this.registerMemory = new ArrayBuffer((34 * 4) + (16 * 4) + (32 * 4) + (32 * 4));
	
	// hi, lo in 32, 33 respectively
	this.gpr = new Uint32Array(this.registerMemory, 0, 34); // general purpose registers
	this.cop0_reg = new Uint32Array(this.registerMemory, 34 * 4, 16); // status registers
	
	// no fancy structures like PCSX has because nothing uses them
	this.cop2_data = new Uint32Array(this.registerMemory, (34 + 16) * 4, 32);
	this.cop2_ctl = new Uint32Array(this.registerMemory, (34 + 16 + 32) * 4, 32);
	
	this.currentFunction = 0;
	this.compiled = {};
}

R3000a.bootAddress = 0xBFC00000;

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

R3000a.prototype.setDiagnosticsOutput = function(diags)
{
	this.diags = diags;
	this.recompiler.diags = diags;
	if (this.memory != null)
		this.memory.diags = diags;
}

R3000a.prototype.panic = function(message)
{
	this.stopped = true;
	throw new Error(message);
}

// used from the WebKit debugger when something goes terribly wrong
R3000a.prototype.__crash = function()
{
	this.diags.error("crashing the n64 engine");
	// this should do it
	this.gpr = null;
	this.fgr = null;
	this.cop0_reg = null;
	this.compiled = null;
}

R3000a.prototype.stop = function()
{
	this.stopped = true;
}

// this simulates the N64 hardware as if it just powered on
R3000a.prototype.hardwareReset = function()
{
	for (var i = 0; i < 32; i++)
	{
		this.gpr[i] = 0;
		this.cop2_ctl[i] = 0;
		this.cop2_data[i] = 0;
	}
	
	// hi, lo
	this.gpr[32] = 0;
	this.gpr[33] = 0;
}

// this simulates the action of the PIF ROM
// furiously inspired from mupen64plus's source code
R3000a.prototype.softwareReset = function(memory, cdrom)
{
	this.memory = memory;
	this.memory.diags = this.diags;
	// fill me up
}

R3000a.prototype.writeCOP0 = function(reg, value)
{
	// TODO complex stuff
	this.cop0_reg[reg] = value;
}

R3000a.prototype.clock = function(ticks)
{
	// TODO timer
}

R3000a.prototype.execute = function(address)
{
	this.stopped = false;
	
	// use the physical address to identify the function, but use the
	// given address to actually compile it
	var physicalAddress = this.memory.translate(address);
	if (!(physicalAddress in this.compiled))
	{
		var compiled = this.recompiler.recompileFunction(this.memory, address);
		this.compiled[physicalAddress] = compiled;
	}
	
	this.compiled[physicalAddress].code.call(this);
}

R3000a.prototype.executeOne = function(address)
{
	var func = this.recompiler.recompileOne(this.memory, address);
	return func.call(this);
}

R3000a.prototype.executeUntilBranchOrAddress = function(address, destAddress)
{
	return this.recompiler.recompileBlock(this.memory, address, destAddress).call(this);
}

// ugly linear search
R3000a.prototype.invalidate = function(address)
{
	for (var startAddress in this.compiled)
	{
		var code = this.compiled[startAddress];
		for (var i = 0; i < code.ranges.length; i++)
		{
			var range = code.ranges[i];
			if (range[0] <= address && range[1] >= address)
			{
				delete this.compiled[startAddress];
				break;
			}
		}
	}
}

