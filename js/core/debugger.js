var Debugger = function(cpu)
{
	var pc = R3000a.bootAddress;
	// ensure that this.pc is always positive
	this.__defineGetter__("pc", function() { return pc; });
	this.__defineSetter__("pc", function(x) { pc = Recompiler.unsign(x); });
	
	this.cpu = cpu;
	this.trace = [];
	this.running = false;
	this.onstepped = null;
	this.diag = console;
}

Debugger.prototype._stepCallback = function()
{
	if (this.onstepped && this.onstepped.call)
		this.onstepped.call(this);
}

Debugger.prototype.getGPR = function(index)
{
	return Recompiler.formatHex32(this.cpu.gpr[index]);
}

Debugger.prototype.setGPR = function(index, value)
{
	value = value.replace(/\s/g, '');
	if (value.indexOf("0x") == 0)
	{
		value = value.substr(2);
		wordLength = 8;
		base = 16;
	}
	else if (value.indexOf("0b") == 0)
	{
		value = value.substr(2);
		wordLength = 32;
		base = 2;
	}
	
	var hi = 0;
	var lo = parseInt(value.substr(-wordLength), base);
	if (value.length > 8)
		hi = parseInt(value.substr(0, value.length - wordLength), base);
	
	this.cpu.gpr[index].set64(hi, lo);
}

Debugger.prototype.getCPR = function(index)
{
	return Recompiler.formatHex32(this.cpu.cop0_reg[index]);
}

Debugger.prototype.setCPR = function(index, value)
{
	value = value.replace(/\s/g, '');
	if (value.indexOf("0x") == 0)
	{
		value = value.substr(2);
		base = 16;
	}
	else if (value.indexOf("0b") == 0)
	{
		value = value.substr(2);
		base = 2;
	}
	
	this.cop0_reg[index] = parseInt(value, base);
}

Debugger.prototype.stepOver = function()
{
	this.updateTrace();
	this.pc = this.cpu.executeOne(this.pc);
	this._stepCallback();
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
	
	// execute the delay slot then jump
	this.cpu.executeOne(this.pc + 4);
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
	this._stepCallback();
}

Debugger.prototype.runUntil = function(desiredPC)
{
	if (this.running)
	{
		this.diag.error("cpu is already executing");
		return;
	}
	
	// one block per event as we don't want the page to get stuck
	var self = this;
	var timeout = null;
	var handle = {
		interrupt: function()
		{
			if (timeout != null)
			{
				clearTimeout(timeout);
				this.running = false;
				this._stepCallback();
			}
		}.bind(self)
	};
	
	var runOneBlock = function()
	{
		this.updateTrace();
		this.pc = this.cpu.executeUntilBranchOrAddress(this.pc, desiredPC);
		if (this.pc == desiredPC)
		{
			this._stepCallback();
			timeout = null;
			this.running = false;
			return;
		}
		
		timeout = setTimeout(runOneBlock, 0);
	}.bind(this);
	
	this.running = true;
	timeout = setTimeout(runOneBlock, 0);
	return handle;
}

Debugger.prototype.updateTrace = function()
{
	var bits = this.cpu.memory.read32(this.pc);
	var op = Disassembler.getOpcode(bits);
	var string = Disassembler.getOpcodeAsString(op);
	this.trace.push([this.pc, string, this.cpu.registerMemory.slice(0)]);
}

