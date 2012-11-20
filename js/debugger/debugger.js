var Debugger = function(psx)
{
	var self = this;
	
	this.stack = [];
	this.psx = psx;
	this.cpu = psx.cpu;
	this.diags = psx.diags;
	this.breakpoints = new BreakpointList(this.cpu);
	this._lastHitBreakpoint = null;
	
	this._pc = R3000a.bootAddress;
	// ensure that this.pc is always positive
	this.__defineGetter__("pc", function() { return this._pc; });
	this.__defineSetter__("pc", function(x) {
		if (this._lastHitBreakpoint != null)
		{
			this._lastHitBreakpoint._skipOnce = false;
			this._lastHitBreakpoint = null;
		}
		this._pc = Recompiler.unsign(x);
	});
	
	this.eventListeners = {};
	this.eventListeners[Debugger.STEPPED_EVENT] = [];
	this.eventListeners[Debugger.STEPPED_INTO_EVENT] = [];
	this.eventListeners[Debugger.STEPPED_OUT_EVENT] = [];
	
	// intercept CPU register reads and writes
	var regs = this.cpu.gpr;
	this.cpu.gpr = {};
	this.lastRegWrites = [];
	
	function gprGetter(i) { return function() { return regs[i]; }; }
	function gprSetter(i)
	{
		return function(value)
		{
			if (!isFinite(value))
				throw new Error("trying to assign a non-finite value to " + Disassembler.registerNames[i]);
			self.lastRegWrites[i] = self._pc;
			regs[i] = value;
		}
	};
	
	for (var i = 0; i < regs.length; i++)
	{
		this.cpu.gpr.__defineGetter__(i, gprGetter(i));
		this.cpu.gpr.__defineSetter__(i, gprSetter(i));
		this.lastRegWrites.push(0);
	}
}

Debugger.STEPPED_EVENT = "stepped";
Debugger.STEPPED_INTO_EVENT = "steppedinto";
Debugger.STEPPED_OUT_EVENT = "steppedout";

Debugger.prototype.addEventListener = function(event, listener)
{
	if (!(event in this.eventListeners))
		return false;
	
	this.eventListeners[event].push(listener);
	return true;
}

Debugger.prototype.removeEventListener = function(event, listener)
{
	if (!(event in this.eventListeners))
		return false;
	
	var index = this.eventListeners[event].indexOf(listener);
	if (index == -1)
		return false;
	
	this.eventListeners.splice(index, 1);
	return true;
}

Debugger.prototype.reset = function(pc)
{
	var self = this;
	var memory = this.psx.memory;
	
	this.pc = pc;
	this.stack = [this.pc];
	this.psx.reset();
	this.breakpoints.resetHits();
	for (var i = 0; i < this.lastRegWrites.length; i++)
		this.lastRegWrites[i] = 0;
	
	// interpose for recompilation
	memory.compiled.recompiler.addInjector({
		injectBeforeInstruction: function(address, opcode, isDelaySlot)
		{
			if (isDelaySlot) return;
			
			var jsCode = "context._pc = " + address + ";\n";
			if (self.breakpoints.hasEnabledBreakpoint(address))
				jsCode += "context.breakpoints.hit(" + address + ");\n";
			
			if (opcode.instruction.name == 'jal' || opcode.instruction.name == 'jalr')
			{
				jsCode += "context._enterFunction(0x" + address.toString(16) + ");\n";
			}
			else if (opcode.instruction.name == 'jr' && opcode.params[0] == 31)
			{
				jsCode += "context._leaveFunction();\n";
			}
			return jsCode;
		}
	});
	
	this._eventCallback(Debugger.STEPPED_EVENT);
	this._eventCallback(Debugger.STEPPED_INTO_EVENT);
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
			this._eventCallback(Debugger.STEPPED_OUT_EVENT);
		}
	}
	else
	{
		try
		{
			var newPC = this.cpu.executeOne(this.pc, this);
			this.pc = newPC;
		}
		catch (ex)
		{
			this._handleException(ex);
		}
	}
	this._eventCallback(Debugger.STEPPED_EVENT);
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
	this._eventCallback(Debugger.STEPPED_INTO_EVENT);
	this._eventCallback(Debugger.STEPPED_EVENT);
}

Debugger.prototype.runUntil = function(desiredPC)
{
	if (!isFinite(desiredPC))
		throw new Error("desiredPC needs to be defined and finite");
	
	desiredPC = Recompiler.unsign(desiredPC);
	this.breakpoints.setBreakpoint(desiredPC);
	try
	{
		this.run();
	}
	finally
	{
		this.breakpoints.removeBreakpoint(desiredPC);
	}
}

Debugger.prototype.run = function()
{
	var self = this;
	function run()
	{
		try
		{
			self.pc = self.cpu.run(self.pc, self);
			self.diags.log("CPU yield at " + Recompiler.formatHex(self.pc));
			setTimeout(run, 0);
		}
		catch (ex)
		{
			self._handleException(ex);
		}
	}
	
	setTimeout(run, 0);
}

Debugger.prototype._enterFunction = function(returnAddress)
{
	this.stack.push(returnAddress);
	this._eventCallback(Debugger.STEPPED_INTO_EVENT);
}

Debugger.prototype._leaveFunction = function()
{
	this.stack.pop();
	this._eventCallback(Debugger.STEPPED_OUT_EVENT);
}

Debugger.prototype._handleException = function(ex)
{
	if (ex.constructor == Breakpoint.Hit)
	{
		this.pc = ex.breakpoint.address;
		this._lastHitBreakpoint = ex.breakpoint;
		this._lastHitBreakpoint._skipOnce = true;
		
		this.diags.log("stopped at 0x%08x", this.pc);
		this._eventCallback(Debugger.STEPPED_EVENT);
	}
	else
	{
		this.diags.error(ex.toString());
		this._eventCallback(Debugger.STEPPED_EVENT);
	}
}

Debugger.prototype._eventCallback = function(fn)
{
	var eventParams = Array.prototype.slice.call(arguments, 1);
	for (var i = 0; i < this.eventListeners[fn].length; i++)
		this.eventListeners[fn][i].apply(this, eventParams);
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

