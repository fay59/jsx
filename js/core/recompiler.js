var Recompiler = function()
{
	this.injectors = [];
}

Recompiler.prototype.recompileFunction = function(memory, startAddress)
{
	if (memory === undefined || startAddress === undefined)
		throw new Error("memory and startAddress must be defined");
	this.memory = memory;
	
	// compiled memory ranges
	var ranges = [];
	
	var jsCode = Recompiler.functionPrelude;
	jsCode += "while (true) {\n";
	jsCode += "var interruptPC = this.checkInterrupts(pc);\n";
	jsCode += "if (interruptPC !== undefined) return interruptPC;\n";
	jsCode += "switch (pc) {\n";
	
	var context = new Recompiler.Context(memory, this.injectors.length == 0);
	context.analyzeBranches(startAddress);
	for (var i = 0; i < context.labels.length; i++)
	{
		var address = context.labels[i];
		var nextLabel = i + 1 < context.labels.length
			? context.labels[i + 1]
			: 0xFFFFFFFF;
		var lastTick = address;
		
		var keepGoing = true;
		jsCode += context.flushRegisters();
		jsCode += "case 0x" + Recompiler.formatHex(address) + ":\n";
		while (keepGoing && address < nextLabel)
		{
			var pattern = this.memory.read32(address);
			var op = Disassembler.getOpcode(pattern);
			if (op == null) this.panic(pattern, this.address);
			
			keepGoing = op.instruction.name[0] != "j";
			if (op.instruction.name[0] == 'b' || !keepGoing)
			{
				jsCode += "this.clock(" + ((address - lastTick) >>> 2) + ");\n";
				lastTick = address;
			}
			
			var injectedBefore = this._injectBefore(address, op, this.isDelaySlot);
			var code = context.recompileOpcode(address, op);
			var injectedAfter = this._injectAfter(address, op, this.isDelaySlot);
			
			jsCode += injectedBefore + code + injectedAfter;
			address += 4;
		}
		
		if (address == nextLabel)
			jsCode += "this.clock(" + ((address - lastTick) >>> 2) + ");\n";
		
		ranges.push([context.labels[i], address]);
	}
	jsCode += "default: this.panic('unreferenced block 0x' + Recompiler.formatHex(pc), pc); break;\n";
	jsCode += "}\n}\n";
	
	var functionName = "." + Recompiler.formatHex(this.startAddress);
	var compiled = new Function("pc", "context", jsCode);
	compiled.name = functionName;
	
	return {
		name: functionName,
		code: compiled,
		
		labels: context.labels,
		
		ranges: ranges,
		totalCount: context.jittedInstructions,
		unimplemented: context.unimplementedInstructionCounts,
	};
}

// recompile one single instruction, useful for stepping
Recompiler.prototype.recompileOne = function(memory, address)
{
	this.memory = memory;
	this.address = address;
	
	var context = new Recompiler.Context(memory, false);
	
	var instruction = memory.read32(address);
	var op = Disassembler.getOpcode(instruction);
	var injectedBefore = this._injectBefore(currentAddress, op, this.isDelaySlot);
	var code = context.recompileOpcode(address, op);
	var injectedAfter = this._injectAfter(currentAddress, op, this.isDelaySlot);
	
	var code = Recompiler.functionPrelude
		+ "var pc = 0x" + Recompiler.formatHex(address) + " + 4;\n"
		+ "do {\n"
		+ injectedBefore + code + injectedAfter
		+ "} while (false);\n";
	
	// account for the delay slot, it needs to be skipped in the case of a
	// branch or call (but NOT in the case of a jump!)
	if (op.instruction.name == 'jal' || op.instruction.name == 'jalr')
		code += "pc += 4;\n";
	
	code += "return pc;\n";
	
	this.address = 0;
	this.memory = null;
	
	return new Function("context", code);
}

Recompiler.prototype.panic = function(instruction, address)
{
	if (isFinite(instruction))
	{
		var binary = instruction.toString(2);
		while (binary.length != 32)
			binary = "0" + binary;
		
		binary = binary.replace(/(....)/g, '$1 ').substr(0, 39);
		throw new Error("No matching instruction for pattern " + binary + " at " + Recompiler.formatHex(address));
	}
	else
	{
		throw new Error(instruction);
	}
}

Recompiler.prototype.addInjector = function(injector)
{
	return this.injectors.push(injector);
}

Recompiler.prototype._injectBefore = function(address, opcode, isDelaySlot)
{
	return this._injectCallback("injectBeforeInstruction", address, opcode, isDelaySlot);
}

Recompiler.prototype._injectAfter = function(address, opcode, isDelaySlot)
{
	return this._injectCallback("injectAfterInstruction", address, opcode, isDelaySlot);
}

Recompiler.prototype._injectAtLabel = function(address)
{
	return this._injectCallback("injectBeforeLabel", address);
}

Recompiler.prototype._injectCallback = function(fn)
{
	var injected = "";
	var args = Array.prototype.slice.call(arguments, 1);
	for (var i = 0; i < this.injectors.length; i++)
	{
		var injector = this.injectors[i];
		if (injector[fn] != undefined && injector[fn].apply != undefined)
		{
			var result = injector[fn].apply(injector, args);
			if (result !== undefined)
				injected += result;
		}
	}
	return injected;
}

Recompiler.functionPrelude = "var overflowChecked = 0;\n";

Recompiler.unsign = function(x)
{
	var lastBit = x & 1;
	return (x >>> 1) * 2 + lastBit;
}

Recompiler.formatHex = function(address, length)
{
	if (length === undefined) length = 8;
	var output = Recompiler.unsign(address).toString(16);
	while (output.length < length)
		output = 0 + output;
	return output;
}

Recompiler.Context = function(memory, optimize)
{
	if (optimize)
	{
		this.gprValues = [0];
		for (var i = 1; i < 34; i++)
			this.gprValues[i] = null;
	}
	else
	{
		this.gprValue = {};
		for (var i = 0; i < 34; i++)
			this.gprValue.__defineGetter__(i, function() { return null; });
	}

	this.labels = [];
	this.code = {};
	this.calls = [];
	this.address = 0;
	this.isDelaySlot = false;
	this.opcodes = {};
	this.unimplementedInstructionCounts = {};
	this.jittedInstructions = 0;
	
	this.memory = memory;
}

Recompiler.Context.prototype.recompileOpcode = function(currentAddress, op)
{
	this.address = currentAddress;
	this.jittedInstructions++;
	var instructionCode = this[op.instruction.name].apply(this, op.params);

	if (instructionCode === undefined)
		instructionCode = "";

	var addressString = Recompiler.formatHex(currentAddress);
	var opcodeString = Disassembler.getOpcodeAsString(op);
	var commentString = addressString + ": " + opcodeString;
	var jsComment = "// " + commentString + "\n";
	
	return jsComment + instructionCode;
}

Recompiler.Context.prototype.countUnimplemented = function(instruction)
{
	if (!(instruction in this.unimplementedInstructionCounts))
		this.unimplementedInstructionCounts[instruction] = 0;
	this.unimplementedInstructionCounts[instruction]++;
}

;(function()
{
	function isKnown(x)
	{
		return x != null && isFinite(x);
	}
	
	function signExt(value, bitSize)
	{
		if (value === undefined || bitSize === undefined)
			throw new Error("undefined value");
		var shift = 32 - bitSize;
		return (value << shift) >> shift;
	}
	
	function sign(value)
	{
		return "(" + value + " | 0)";
	}
	
	function hex(x)
	{
		if (x === undefined)
			this.panic("undefined value to format");
		return "0x" + Recompiler.formatHex(x);
	}
	
	function panic(message, pc)
	{
		return "this.panic('" + message + "', " + pc + ");\n";
	}
	
	Recompiler.Context.prototype.analyzeBranches = function(startAddress)
	{
		var addressesToCompile = [startAddress];
		var visitedAddresses = {};
		
		var self = this;
		function addToAddresses(addr)
		{
			if (self.labels.indexOf(addr) == -1)
				addressesToCompile.push(addr);
		}
		
		while (addressesToCompile.length > 0)
		{
			var address = addressesToCompile.shift();
			this.labels.push(address);
			
			while (true)
			{
				if (address in visitedAddresses)
					break;
				
				var instruction = this.memory.read32(address);
				visitedAddresses[address] = true;
				
				var op = Disassembler.getOpcode(instruction);
				if (op.instruction.name == "j" || op.instruction.name == "jr")
				{
					break;
				}
				else if (op.instruction.name[0] == "b")
				{
					var offset = op.params[op.params.length - 1];
					var targetAddress = Recompiler.unsign(address + 4 + (signExt(offset, 16) << 2));
					addToAddresses(targetAddress);
				}
				address += 4;
			}
		}
		this.labels.sort(function(a,b) { return a - b; });
	}

	Recompiler.Context.prototype.flushRegisters = function(nullify)
	{
		var result = "";
		for (var i = 1; i < this.gprValues.length; i++)
		{
			if (isKnown(this.gprValues[i]))
			{
				result += "this.gpr[" + i + "] = " + this.gprValues[i] + ";\n";
				if (nullify === undefined || nullify)
					this.gprValues[i] = null;
			}
		}
		return result;
	}
	
	Recompiler.Context.prototype.gpr = function(reg)
	{
		if (reg === undefined)
			throw new Error("undefined value");
			
		if (reg == 0)
			return 0;
		
		if (isKnown(this.gprValues[reg]))
			return this.gprValues[reg];
		
		return "this.gpr[" + reg + "]";
	}
	
	// return something that's suitable as a left-hand side expression
	Recompiler.Context.prototype.lgpr = function(reg)
	{
		if (reg == 0)
			return "this.panic('uncaught write to r0'); //";
		
		return "this.gpr[" + reg + "]";
	}
	
	Recompiler.Context.prototype.binaryOp = function(op, dest, source, value)
	{
		if (op === undefined || dest === undefined || source === undefined || value === undefined)
			this.panic("undefined argument");
		
		if (dest == 0) return;
		
		if (isKnown(this.gprValues[source]) && isKnown(value))
		{
			this.gprValues[dest] = eval("this.gprValues[dest] = this.gprValues[source] " + op + " value");
			return;
		}
		else
		{
			this.gprValues[dest] = null;
			if (source == dest)
			{
				return this.lgpr(dest) + " " + op + "= " + value + ";\n";
			}
			else
			{
				return this.lgpr(dest) + " = " + this.gpr(source) + " " + op + " " + value + ";\n";
			}
		}
	}
	
	Recompiler.Context.prototype.binaryOpTrap = function(address, op, dest, source, value)
	{
		if (op === undefined || dest === undefined || source === undefined || value === undefined)
			this.panic("undefined argument");
		
		if (dest == 0) return;
		
		if (isKnown(this.gprValues[source]) && isKnown(value))
		{
			var overflowChecked = eval("this.gprValues[dest] = this.gprValues[source] " + op + " value");
			if (overflowChecked > 0xFFFFFFFF || overflowChecked < -0x80000000)
			{
				this.gprValues[dest] = null;
				return "this.panic('time to implement exceptions', " + address + ");\n";
			}
			else
			{
				this.gprValues[dest] = overflowChecked;
				return;
			}
		}
		else
		{
			var jsCode = "overflowChecked = " + this.gpr(source) + " " + op + " " + value + ";\n";
			jsCode += "if (overflowChecked > 0xFFFFFFFF || overflowChecked < -0x80000000)\n";
			// TODO implement overflow exceptions
			jsCode += "\tthis.panic('time to implement exceptions', " + address + ");\n";
			jsCode += this.lgpr(dest) + " = overflowChecked;\n";
			return jsCode;
		}
	}
	
	Recompiler.Context.prototype.load = function(bits, addressReg, offset, into, signedLoad)
	{
		if (bits === undefined || addressReg === undefined || offset === undefined || into === undefined)
			this.panic("undefined argument");
		
		var address = this.gpr(addressReg);
		if (isKnown(address))
			address = Recompiler.unsign(address);
		
		offset = signExt(offset, 16);
		address += " + " + offset;
		
		this.gprValues[into] = null;
		if (signedLoad)
		{
			var shift = 32 - bits;
			return this.lgpr(into) + " = (this.memory.read" + bits + "(" + address + ") << " + shift + ") >> " + shift + ";\n";
		}
		else
		{
			return this.lgpr(into) + " = this.memory.read" + bits + "(" + address + ");\n";
		}
	}
	
	Recompiler.Context.prototype.store = function(bits, addressReg, offset, value)
	{
		if (bits === undefined || addressReg === undefined || offset === undefined || value === undefined)
			this.panic("undefined argument");
		
		var address = this.gpr(addressReg);
		if (isKnown(address))
			address = Recompiler.unsign(address);
		
		offset = signExt(offset, 16);
		address += " + " + offset;
		
		var jsCode = "this.memory.write" + bits + "(" + address + ", " + this.gpr(value) + ");\n";
		jsCode += "this.invalidate(" + address + ");\n";
		return jsCode;
	}
	
	Recompiler.Context.prototype.delaySlot = function()
	{
		this.isDelaySlot = true;
		try
		{
			var delaySlotAddress = this.address + 4;
			var instruction = this.memory.read32(delaySlotAddress);
			var delaySlot = Disassembler.getOpcode(instruction);
			if (delaySlot.instruction.name[0] == 'b' || delaySlot.instruction.name[0] == 'j')
				return "this.panic('branch in delay slot is undefined behavior', " + delaySlotAddress + ");\n";
			
			var jsCode = "// delay slot:\n";
			jsCode += this.recompileOpcode(delaySlotAddress, delaySlot);
			return jsCode;
		}
		finally
		{
			this.isDelaySlot = false;
		}
	}
	
	Recompiler.Context.prototype.branch = function(condition, offset)
	{
		var opAddress = this.address + 4;
		var targetAddress = Recompiler.unsign(opAddress + (signExt(offset, 16) << 2));
		
		var jsCode = "if (" + condition + ") {\n";
		jsCode += this.delaySlot();
		jsCode += this.flushRegisters(false);
		jsCode += "pc = " + hex(targetAddress) + ";\n";
		jsCode += "break;\n";
		jsCode += "}\n";
		this.address -= 4;
		
		return jsCode;
	}
	
	//  ----
	function impl(inst, func)
	{
		Recompiler.Context.prototype[inst] = func;
	}
	
	impl("add", function(s, t, d) {
		return this.binaryOpTrap(this.address - 4, "+", d, s, this.gpr(t));
	});
	
	impl("addi", function(s, t, i) {
		return this.binaryOpTrap(this.address - 4, "+", t, s, signExt(i, 16));
	});
	
	impl("addiu", function(s, t, i) {
		return this.binaryOp("+", t, s, signExt(i, 16));
	});
	
	impl("addu", function(s, t, d) {
		return this.binaryOp("+", d, s, this.gpr(t));
	});
	
	impl("and", function(s, t, d) {
		return this.binaryOp("&", d, s, this.gpr(t));
	});
	
	impl("andi", function(s, t, i) {
		return this.binaryOp("&", t, s, hex(i));
	});
	
	impl("avsz3", function() {
		countUnimplemented.call(this, "avsz3");
		return panic("avsz3 is not implemented", this.address - 4);
	});
	
	impl("avsz4", function() {
		countUnimplemented.call(this, "avsz4");
		return panic("avsz4 is not implemented", this.address - 4);
	});
	
	impl("beq", function(s, t, i) {
		return this.branch(this.gpr(s) + " == " + this.gpr(t), i);
	});
	
	impl("beql", function() {
		countUnimplemented.call(this, "beql");
		return panic("beql is not implemented", this.address - 4);
	});
	
	impl("bgez", function(s, i) {
		return this.branch(sign(this.gpr(s)) + " >= 0", i);
	});
	
	impl("bgezal", function() {
		countUnimplemented.call(this, "bgezal");
		return panic("bgezal is not implemented", this.address - 4);
	});
	
	impl("bgtz", function(s, i) {
		return this.branch(sign(this.gpr(s)) + " > 0", i);
	});
	
	impl("blez", function(s, i) {
		return this.branch(sign(this.gpr(s)) + " <= 0", i);
	});
	
	impl("bltz", function(s, i) {
		return this.branch(sign(this.gpr(s)) + " < 0", i);
	});
	
	impl("bltzal", function() {
		countUnimplemented.call(this, "bltzal");
		return panic("bltzal is not implemented", this.address - 4);
	});
	
	impl("bne", function(s, t, i) {
		return this.branch(this.gpr(s) + " != " + this.gpr(t), i);
	});
	
	impl("break", function() {
		return panic("breakpoint hit");
	});
	
	impl("cc", function() {
		countUnimplemented.call(this, "cc");
		return panic("cc is not implemented", this.address - 4);
	});
	
	impl("cdp", function() {
		countUnimplemented.call(this, "cdp");
		return panic("cdp is not implemented", this.address - 4);
	});
	
	impl("cfc0", function() {
		countUnimplemented.call(this, "cfc0");
		return panic("cfc0 is not implemented", this.address - 4);
	});
	
	impl("cfc2", function() {
		countUnimplemented.call(this, "cfc2");
		return panic("cfc2 is not implemented", this.address - 4);
	});
	
	impl("ctc0", function() {
		countUnimplemented.call(this, "ctc0");
		return panic("ctc0 is not implemented", this.address - 4);
	});
	
	impl("ctc2", function() {
		countUnimplemented.call(this, "ctc2");
		return panic("ctc2 is not implemented", this.address - 4);
	});
	
	impl("dpcl", function() {
		countUnimplemented.call(this, "dpcl");
		return panic("dpcl is not implemented", this.address - 4);
	});
	
	impl("div", function(s, t) {
		var sVal = this.gpr(s);
		var tVal = this.gpr(t);
		if (isKnown(sVal) && isKnown(tVal))
		{
			sVal |= 0;
			tVal |= 0;
			this.gprValues[32] = sVal % tVal;
			this.gprValues[33] = sVal / tVal;
			return;
		}
		else
		{
			var jsCode = "this.gpr[32] = " + sign(this.gpr(s)) + " % " + sign(this.gpr(t)) + ";\n";
			jsCode += "this.gpr[33] = " + sign(this.gpr(s)) + " / " + sign(this.gpr(t)) + ";\n";
			return jsCode;
		}
	});
	
	impl("divu", function(s, t) {
		var sVal = this.gpr(s);
		var tVal = this.gpr(t);
		if (isKnown(sVal) && isKnown(tVal))
		{
			sVal = Recompiler.unsign(sVal);
			tVal = Recompiler.unsign(tVal);
			this.gprValues[32] = sVal % tVal;
			this.gprValues[33] = sVal / tVal;
			return;
		}
		else
		{
			var jsCode = "this.gpr[32] = " + this.gpr(s) + " % " + this.gpr(t) + ";\n";
			jsCode += "this.gpr[33] = " + this.gpr(s) + " / " + this.gpr(t) + ";\n";
			return jsCode;
		}
	});
	
	impl("dpcs", function() {
		countUnimplemented.call(this, "dpcs");
		return panic("dpcs is not implemented", this.address - 4);
	});
	
	impl("dpct", function() {
		countUnimplemented.call(this, "dpct");
		return panic("dpct is not implemented", this.address - 4);
	});
	
	impl("gpf", function() {
		countUnimplemented.call(this, "gpf");
		return panic("gpf is not implemented", this.address - 4);
	});
	
	impl("gpl", function() {
		countUnimplemented.call(this, "gpl");
		return panic("gpl is not implemented", this.address - 4);
	});
	
	impl("intpl", function() {
		countUnimplemented.call(this, "intpl");
		return panic("intpl is not implemented", this.address - 4);
	});
	
	impl("j", function(i) {
		var opAddress = this.address - 4;
		var jumpAddress = Recompiler.unsign((opAddress & 0xF0000000) | (i << 2));
		var jsCode = this.delaySlot();
		jsCode += this.flushRegisters();
		jsCode += "return " + hex(jumpAddress) + ";\n";
		return jsCode;
	});
	
	impl("jal", function(i) {
		var jumpAddress = ((this.address - 4) & 0xF0000000) | (i << 2);
		
		var jsCode = this.delaySlot();
		jsCode += this.flushRegisters();
		jsCode += this.lgpr(31) + " = " + hex(this.address) + ";\n";
		jsCode += "return " + hex(jumpAddress) + ";\n";
		
		return jsCode;
	});
	
	impl("jalr", function(s, d) {
		var jsCode = this.delaySlot();
		jsCode += this.flushRegisters();
		jsCode += this.lgpr(d) + " = " + hex(this.address) + ";\n"
		jsCode += "return " + this.gpr(s) + ";\n";
		return jsCode;
	});
	
	impl("jr", function(s) {
		var jsCode = this.delaySlot();
		jsCode += this.flushRegisters();
		jsCode += "return " + this.gpr(s) + ";\n";
		return jsCode;
	});
	
	impl("lb", function(s, t, i) {
		return this.load(8, s, i, t, true);
	});
	
	impl("lbu", function(s, t, i) {
		return this.load(8, s, i, t, false);
	});
	
	impl("lh", function(s, t, i) {
		return this.load(16, s, i, t, true);
	});
	
	impl("lhu", function(s, t, i) {
		return this.load(16, s, i, t, false);
	});
	
	impl("lui", function(t, i) {
		this.gprValues[t] = i << 16;
	});
	
	impl("lw", function(s, t, i) {
		return this.load(32, s, i, t);
	});
	
	impl("lwc2", function() {
		countUnimplemented.call(this, "lwc2");
		return panic("lwc2 is not implemented", this.address - 4);
	});
	
	impl("lwl", function() {
		countUnimplemented.call(this, "lwl");
		return panic("lwl is not implemented", this.address - 4);
	});
	
	impl("lwr", function() {
		countUnimplemented.call(this, "lwr");
		return panic("lwr is not implemented", this.address - 4);
	});
	
	impl("mfc0", function(t, l) { // t is the gpr, l is the cop0 reg
		this.gprValues[t] = null;
		return this.lgpr(t) + " = this.cop0_reg[" + l + "];\n";
	});
	
	impl("mfc2", function() {
		countUnimplemented.call(this, "mfc2");
		return panic("mfc2 is not implemented", this.address - 4);
	});
	
	impl("mfhi", function(d) {
		var hi = this.gpr(32);
		if (isKnown(hi))
			this.gprValues[d] = hi;
		else
		{
			this.gprValues[d] = null;
			return this.lgpr(d) + " = " + hi + ";\n";
		}
	});
	
	impl("mflo", function(d) {
		var lo = this.gpr(33);
		if (isKnown(lo))
			this.gpr[d] = lo;
		else
		{
			this.gprValues[d] = null;
			return this.lgpr(d) + " = " + lo + ";\n";
		}
	});
	
	impl("mtc0", function(t, l) {
		return "this.writeCOP0(" + l + ", " + this.gpr(t) + ");\n";
	});
	
	impl("mtc2", function() {
		countUnimplemented.call(this, "mtc2");
		return panic("mtc2 is not implemented", this.address - 4);
	});
	
	impl("mthi", function(d) {
		var dValue = this.gpr(d);
		if (isKnown(dValue))
			this.gprValues[32] = dValue;
		else
		{
			this.gprValues[d] = null;
			return this.lgpr(32) + " = " + dValue + ";\n";
		}
	});
	
	impl("mtlo", function(d) {
		var dValue = this.gpr(d);
		if (isKnown(dValue))
			this.gprValues[33] = dValue;
		else
		{
			this.gprValues[d] = null;
			return this.lgpr(33) + " = " + dValue + ";\n";
		}
	});
	
	impl("mult", function() {
		countUnimplemented.call(this, "mult");
		return panic("mult is not implemented", this.address - 4);
	});
	
	impl("multu", function(s, t) {
		var sValue = this.gpr(s);
		var tValue = this.gpr(t);
		if (isKnown(sValue) && isKnown(tValue))
			R3000a.runtime.multu(this.gprValues, sValue, tValue);
		else
		{
			this.gprValues[32] = null;
			this.gprValues[33] = null;
			return "R3000a.runtime.multu(this.gpr, " + this.gpr(t) + ", " + this.gpr(s) + ");\n";
		}
	});
	
	impl("mvmva", function() {
		countUnimplemented.call(this, "mvmva");
		return panic("mvmva is not implemented", this.address - 4);
	});
	
	impl("nccs", function() {
		countUnimplemented.call(this, "nccs");
		return panic("nccs is not implemented", this.address - 4);
	});
	
	impl("ncct", function() {
		countUnimplemented.call(this, "ncct");
		return panic("ncct is not implemented", this.address - 4);
	});
	
	impl("ncds", function() {
		countUnimplemented.call(this, "ncds");
		return panic("ncds is not implemented", this.address - 4);
	});
	
	impl("ncdt", function() {
		countUnimplemented.call(this, "ncdt");
		return panic("ncdt is not implemented", this.address - 4);
	});
	
	impl("nclip", function() {
		countUnimplemented.call(this, "nclip");
		return panic("nclip is not implemented", this.address - 4);
	});
	
	impl("ncs", function() {
		countUnimplemented.call(this, "ncs");
		return panic("ncs is not implemented", this.address - 4);
	});
	
	impl("nct", function() {
		countUnimplemented.call(this, "nct");
		return panic("nct is not implemented", this.address - 4);
	});
	
	impl("nor", function(s, t, d) {
		var sValue = this.gpr(s);
		var tValue = this.gpr(t);
		if (isKnown(sValue) && isKnown(tValue))
			this.gprValues[d] = ~(sValue | tValue);
		else
		{
			this.gprValues[d] = null;
			return this.lgpr(d) + " = ~(" + this.gpr(s) + " | " + this.gpr(t) + ");\n";
		}
	});
	
	impl("or", function(s, t, d) {
		return this.binaryOp("|", d, s, this.gpr(t));
	});
	
	impl("ori", function(s, t, i) {
		return this.binaryOp("|", t, s, hex(i));
	});
	
	impl("rfe", function() {
		return "this.writeCOP0(12, (this.cop0_reg[12] & 0xfffffff0) | ((this.cop0_reg[12] & 0x3c) >>> 2));\n";
	});
	
	impl("rtps", function() {
		countUnimplemented.call(this, "rtps");
		return panic("rtps is not implemented", this.address - 4);
	});
	
	impl("rtpt", function() {
		countUnimplemented.call(this, "rtpt");
		return panic("rtpt is not implemented", this.address - 4);
	});
	
	impl("sb", function(s, t, i) {
		return this.store(8, s, i, t);
	});
	
	impl("sh", function(s, t, i) {
		return this.store(16, s, i, t);
	});
	
	impl("sll", function(t, d, i) {
		return this.binaryOp("<<", d, t, hex(i));
	});
	
	impl("sllv", function(s, t, d) {
		return this.binaryOp("<<", d, t, this.gpr(s));
	});
	
	impl("slt", function(s, t, d) {
		var sValue = this.gpr(s);
		var tValue = this.gpr(t);
		if (isKnown(sValue) && isKnown(tValue))
			this.gprValues[d] = ((sValue | 0) < (tValue | 0)) | 0;
		else
		{
			this.gprValues[d] = null;
			return this.lgpr(d) + " = " + sign(this.gpr(s)) + " < " + sign(this.gpr(t)) + ";\n";
		}
	});
	
	impl("slti", function(s, t, i) {
		var sValue = this.gpr(s);
		if (isKnown(sValue) && isKnown(tValue))
			this.gprValues[t] = ((sValue | 0) < signExt(i, 16)) | 0;
		else
		{
			this.gprValues[t] = null;
			return this.lgpr(t) + " = " + sign(this.gpr(s)) + " < " + signExt(i, 16) + ";\n";
		}
	});
	
	impl("sltiu", function(s, t, i) {
		var sValue = this.gpr(s);
		if (isKnown(sValue) && isKnown(tValue))
			this.gprValues[t] = (Recompiler.unsign(sValue) < i) | 0;
		else
		{
			this.gprValues[t] = null;
			return this.lgpr(t) + " = " + this.gpr(s) + " < " + i + ";\n";
		}
	});
	
	impl("sltu", function(s, t, d) {
		var sValue = this.gpr(s);
		var tValue = this.gpr(t);
		if (isKnown(sValue) && isKnown(tValue))
			this.gprValues[d] = (Recompiler.unsign(sValue) < Recompiler.unsign(tValue)) | 0;
		else
		{
			this.gprValues[d] = null;
			return this.lgpr(d) + " = " + this.gpr(s) + " < " + this.gpr(t) + ";\n";
		}
	});
	
	impl("sqr", function() {
		countUnimplemented.call(this, "sqr");
		return panic("sqr is not implemented", this.address - 4);
	});
	
	impl("sra", function(t, d, i) {
		return this.binaryOp(">>", d, t, i);
	});
	
	impl("srav", function(s, t, d) {
		return this.binaryOp(">>", d, t, this.gpr(s));
	});
	
	impl("srl", function(t, d, i) {
		return this.binaryOp(">>>", d, t, i);
	});
	
	impl("srlv", function(s, t, d) {
		return this.binaryOp(">>>", d, t, this.gpr(s));
	});
	
	impl("sub", function() {
		countUnimplemented.call(this, "sub");
		return panic("sub is not implemented", this.address - 4);
	});
	
	impl("subu", function(s, t, d) {
		return this.binaryOp("-", d, s, this.gpr(t));
	});
	
	impl("sw", function(s, t, i) {
		return this.store(32, s, i, t);
	});
	
	impl("swc2", function() {
		countUnimplemented.call(this, "swc2");
		return panic("swc2 is not implemented", this.address - 4);
	});
	
	impl("swl", function() {
		countUnimplemented.call(this, "swl");
		return panic("swl is not implemented", this.address - 4);
	});
	
	impl("swr", function() {
		countUnimplemented.call(this, "swr");
		return panic("swr is not implemented", this.address - 4);
	});
	
	impl("syscall", function() {
		return "return this.raiseException(" + hex(this.address - 4) + ", 0x20, " + this.isDelaySlot + ");\n";
	});
	
	impl("xor", function() {
		countUnimplemented.call(this, "xor");
		return panic("xor is not implemented", this.address - 4);
	});
	
	impl("xori", function() {
		// the immediate is NOT sign extended
		countUnimplemented.call(this, "xori");
		return panic("xori is not implemented", this.address - 4);
	});
})();