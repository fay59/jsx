var Debugger = function(cpu)
{
	var pc = R3000a.bootAddress;
	// ensure that this.pc is always positive
	this.__defineGetter__("pc", function() { return pc; });
	this.__defineSetter__("pc", function(x) { pc = Recompiler.unsign(x); });
	
	this.stack = [];
	this.cpu = cpu;
	this.diag = console;
	this.breakpoints = new BreakpointList(cpu);
	
	this.onstepped = null;
	this.onsteppedinto = null;
	this.onsteppedout = null;
	
	var self = this;
	
	// intercept CPU registers
	var regs = this.cpu.gpr;
	this.cpu.gpr = {};
	function gprGetter(i) { return function() { return regs[i]; }; }
	function gprSetter(i)
	{
		return function(value)
		{
			if (!isFinite(value))
				throw new Error("trying to assign a non-finite value to " + Disassembler.registerNames[i]);
			regs[i] = value;
		}
	};
	
	for (var i = 0; i < regs.length; i++)
	{
		this.cpu.gpr.__defineGetter__(i, gprGetter(i));
		this.cpu.gpr.__defineSetter__(i, gprSetter(i));
	}
	
	// interpose for recompilation
	this.cpu.recompiler.injector = {
		injectBefore: function(address, opcode)
		{
			if (opcode.instruction.name == 'jal' || opcode.instruction.name == 'jalr')
			{
				return "context._enterFunction(0x" + address.toString(16) + ");\n";
			}
			else if (opcode.instruction.name == 'jr' && opcode.params[0] == 31)
			{
				return "context._leaveFunction();\n";
			}
		},
		
		injectAfter: function(address, opcode)
		{
			var nextAddress = address + 4;
			// in case of a jump, account for the delay slot too
			if (opcode.instruction.name[0] == "j")
				nextAddress += 4;
			
			if (self.breakpoints.hasEnabledBreakpoint(nextAddress))
				return "context.breakpoints.hit(" + nextAddress + ");\n";
			
			if ((address & 0x1FFFFFFF) == (0xbfc00da0 & 0x1fffffff))
				return "console.debug('hit 0xbfc00da0');\n";
		}
	};
}

Debugger.prototype.reset = function(pc, memory)
{
	this.pc = pc;
	this.stack = [this.pc];
	this.cpu.hardwareReset();
	this.cpu.softwareReset(memory);
	
	this._stepCallback(this.onstepped);
	this._stepCallback(this.onsteppedinto);
}

Debugger.prototype.getGPR = function(index)
{
	return "0x" + Recompiler.formatHex(this.cpu.gpr[index]);
}

Debugger.prototype.setGPR = function(index, value)
{
	this.cpu.gpr[index] = this._parseValue(value);
}

Debugger.prototype.getCPR = function(index)
{
	return "0x" + Recompiler.formatHex(this.cpu.cop0_reg[index]);
}

Debugger.prototype.setCPR = function(index, value)
{
	this.cpu.gpr[index] = this._parseValue(value);
}

Debugger.prototype.setBreakpoint = function(breakpoint)
{
	if (!isFinite(breakpoint))
		throw new Error("breakpoint needs to be defined and numeric");
	
	breakpoint = Recompiler.unsign(breakpoint);
	this.breakpoints.setBreakpoint(breakpoint)
}

Debugger.prototype.removeBreakpoint = function(breakpoint)
{
	if (!isFinite(breakpoint))
		throw new Error("breakpoint needs to be defined and numeric");
	
	this.breakpoints.removeBreakpoint(breakpoint);
}

Debugger.prototype.stepOver = function()
{
	// jr must be manually implemented
	var bits = this.cpu.memory.read32(this.pc);
	var opcode = Disassembler.getOpcode(bits);
	if (opcode.instruction.name == "jr")
	{
		// execute the delay slot then return
		this.cpu.executeOne(this.pc + 4, this);
		this.pc = this.cpu.gpr[opcode.params[0]];
		if (opcode.params[0] == 31)
		{
			this.stack.pop();
			this._stepCallback(this.onsteppedout);
		}
	}
	else
	{
		try
		{
			var newPC = this.cpu.executeOne(this.pc, this);
			// correct for branches
			if (newPC == this.pc + 4 && opcode.instruction.name[0] == 'b')
				newPC += 4;
			this.pc = newPC;
		}
		catch (ex)
		{
			this._handleException(ex);
		}
	}
	this._stepCallback(this.onstepped);
}

Debugger.prototype.canStepInto = function()
{
	if (this.cpu.memory == undefined)
		return false;
	
	var bits = this.cpu.memory.read32(this.pc);
	var opcode = Disassembler.getOpcode(bits);
	return opcode.instruction.name == "jal" || opcode.instruction.name == "jalr";
}

Debugger.prototype.stepInto = function()
{
	var bits = this.cpu.memory.read32(this.pc);
	var opcode = Disassembler.getOpcode(bits);
	if (opcode.instruction.name != "jal" && opcode.instruction.name != "jalr")
		return false;
	
	this.stack.push(this.pc + 8);
	
	// execute the delay slot then jump
	this.cpu.executeOne(this.pc + 4, this);
	if (opcode.instruction.name == "jal")
	{
		this.cpu.gpr[31] = this.pc + 8;
		this.pc = (this.pc & 0xF0000000) | (opcode.params[0] << 2);
	}
	else
	{
		this.cpu.gpr[opcode.params[1]] = this.pc + 8;
		this.pc = this.cpu.gpr[opcode.params[0]];
	}
	this._stepCallback(this.onsteppedinto);
	this._stepCallback(this.onstepped);
}

Debugger.prototype.stepOut = function()
{
	this.cpu.execute(this.pc, this);
	this.pc = this.stack.pop();
	this._stepCallback(this.onsteppedout);
	this._stepCallback(this.onstepped);
}

Debugger.prototype.runUntil = function(desiredPC)
{
	if (!isFinite(desiredPC))
		throw new Error("desiredPC needs to be defined and finite");
	
	desiredPC = Recompiler.unsign(desiredPC);
	this.breakpoints.addBreakpoint(desiredPC);
	try
	{
		this.cpu.execute(this.pc, this);
	}
	catch (ex)
	{
		this._handleException(ex);
		if (ex.constructor == Breakpoint.Hit && ex.address == desiredPC)
			this.breakpoints.removeBreakpoint(desiredPC)
	}
}

Debugger.prototype.run = function()
{
	try
	{
		this.cpu.execute(this.pc, this);
	}
	catch (ex)
	{
		this._handleException(ex);
	}
}

Debugger.prototype._enterFunction = function(returnAddress)
{
	this.stack.push(returnAddress);
	this._stepCallback(this.onsteppedinto);
}

Debugger.prototype._leaveFunction = function()
{
	this.stack.pop();
	this._stepCallback(this.onsteppedout);
}

Debugger.prototype._handleException = function(ex)
{
	if (ex.constructor == Breakpoint.Hit)
	{
		this.pc = ex.breakpoint.address;
		this.diags.log("stopped at " + this.pc);
		this._stepCallback(this.onstepped);
	}
	else if (ex.constructor == ExecutionException)
	{
		this.diags.error(ex.cause ? ex.cause.message : ex.message);
		this.pc = ex.pc;
		this._stepCallback(this.onstepped);
	}
	else
	{
		this.diags.error(ex.message);
	}
}

Debugger.prototype._stepCallback = function(fn)
{
	if (fn != null && fn.call)
		fn.call(this);
}

Debugger.prototype._parseValue = function(value)
{
	value = value.replace(/\s/g, '');
	if (value.indexOf("0x") == 0)
	{
		value = value.substr(2);
		return parseInt(value, 16);
	}
	else if (value.indexOf("0b") == 0)
	{
		value = value.substr(2);
		return parseInt(value, 2);
	}
	return parseInt(value);
}

