var Breakpoint = function(address)
{
	this.address = address;
}

Breakpoint.prototype.toString = function()
{
	return "breakpoint at address 0x" + Recompiler.formatHex(this.address);
}

var Debugger = function(cpu)
{
	var pc = R3000a.bootAddress;
	// ensure that this.pc is always positive
	this.__defineGetter__("pc", function() { return pc; });
	this.__defineSetter__("pc", function(x) { pc = Recompiler.unsign(x); });
	
	this.stack = [];
	this.cpu = cpu;
	this.trace = [];
	this.running = false;
	this.diag = console;
	this.breakpoints = [];
	this.readBreakpoints = [];
	this.writeBreakpoints = [];
	
	this.onstepped = null;
	this.onsteppedinto = null;
	this.onsteppedout = null;
	
	var self = this;
	
	this.cpu.recompiler.injector = {
		injectBefore: function(address, opcode)
		{
			if (opcode.instruction.name == 'jal')
			{
				var segmentPrefix = (address - 4) & 0xF0000000;
				var targetWord = opcode.params[0] << 2;
				var jumpAddress = Recompiler.unsign(segmentPrefix | targetWord);
				
				var jsCode = "context.stack.push(" + jumpAddress + ");\n";
				jsCode += "context._stepCallback(context.onsteppedinto);\n";
				return jsCode;
			}
			else if (opcode.instruction.name == 'jalr')
			{
				var targetReg = opcode.params[0];
				var jsCode = "context.stack.push(this.gpr[" + targetReg + "]);\n";
				jsCode += "context._stepCallback(context.onsteppedinto);\n";
				return jsCode;
			}
			else if (opcode.instruction.name == 'jr' && opcode.params[0] == 31)
			{
				var jsCode = "context.stack.pop();\n";
				jsCode += "context._stepCallback(context.onsteppedout);\n";
				return jsCode;
			}
		},
		injectAfter: function(address, opcode)
		{
			var nextAddress = address + 4;
			if (self.breakpoints.indexOf(nextAddress) != -1)
				return "throw new Breakpoint(0x" + Recompiler.formatHex(nextAddress) + ");\n";
		}
	};
}

Debugger.prototype.reset = function(pc, memory)
{
	this.pc = pc;
	this.stack = [0];
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
	this.breakpoints.push(breakpoint);
	this.cpu.invalidate(breakpoint);
}

Debugger.prototype.removeBreakpoint = function(breakpoint)
{
	if (!isFinite(breakpoint))
		throw new Error("breakpoint needs to be defined and numeric");
	
	breakpoint = Recompiler.unsign(breakpoint);
	var index = this.breakpoints.indexOf(breakpoint);
	if (index != -1)
	{
		this.breakpoints.splice(index, 1);
		this.cpu.invalidate(breakpoint);
		return true;
	}
	return false;
}

Debugger.prototype.stepOver = function()
{
	this.updateTrace();
	
	// jr ra must be manually implemented
	var bits = this.cpu.memory.read32(this.pc);
	var opcode = Disassembler.getOpcode(bits);
	if (opcode.instruction.name == "jr" && opcode.params[0] == 31)
	{
		// execute the delay slot then return
		this.cpu.executeOne(this.pc + 4, this);
		this.pc = this.cpu.gpr[31];
		this.stack.pop();
		this._stepCallback(this.onsteppedout);
	}
	else
	{
		try
		{
			this.pc = this.cpu.executeOne(this.pc, this);
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
	this.breakpoints.push(desiredPC);
	this.cpu.invalidate(desiredPC);
	try
	{
		this.cpu.execute(this.pc, this);
	}
	catch (ex)
	{
		this._handleException(ex);
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

Debugger.prototype.updateTrace = function()
{
	var bits = this.cpu.memory.read32(this.pc);
	var op = Disassembler.getOpcode(bits);
	var string = Disassembler.getOpcodeAsString(op);
	this.trace.push([this.pc, string, this.cpu.registerMemory.slice(0)]);
}

Debugger.prototype._handleException = function(ex)
{
	if (ex.constructor == Breakpoint)
	{
		this.pc = ex.address;
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

