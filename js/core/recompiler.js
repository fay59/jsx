var Recompiler = function()
{
	this.injectors = [];
	
	this.optimizations = {
		foldConstants: true,
		bypassReadMethods: true,
		bypassWriteMethods: true
	};
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
	jsCode += this._injectAfterBranch();
	jsCode += "switch (pc) {\n";
	
	var context = new Recompiler.Context(memory, this.optimizations);
	context.analyzeBranches(startAddress);
	for (var i = 0; i < context.labels.length; i++)
	{
		var address = context.labels[i];
		var nextLabel = i + 1 < context.labels.length
			? context.labels[i + 1]
			: 0x100000000; // 0xffffffff + 1
		var cycles = 0;
		
		var keepGoing = true;
		jsCode += context.flushRegisters();
		jsCode += "case 0x" + Recompiler.formatHex(address) + ":\n";
		while (keepGoing && address < nextLabel)
		{
			var pattern = this.checkedRead32(address);
			var op = Disassembler.getOpcode(pattern);
			if (op == null) this.panic(pattern, this.address);
			
			var injectedBefore = this._injectBefore(address, op, this.isDelaySlot);
			var code = context.recompileOpcode(address, op);
			var injectedAfter = this._injectAfter(address, op, this.isDelaySlot);
			
			cycles += context.cyclesOfLastOperation;
			keepGoing = op.instruction.name[0] != 'j';
			if (op.instruction.name[0] == 'b' || !keepGoing)
			{
				injectedBefore += "this.clock(" + cycles + ");\n";
				cycles = 0;
			}
			
			if (code == "")
				code = "// nop\n";
			
			jsCode += injectedBefore + code + injectedAfter;
			address += 4;
		}
		
		if (address == nextLabel)
		{
			jsCode += "this.clock(" + cycles + ");\n";
			cycles = 0;
		}
		
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
	var injectedBefore = this._injectBefore(address, op, this.isDelaySlot);
	var code = context.recompileOpcode(address, op);
	var injectedAfter = this._injectAfter(address, op, this.isDelaySlot);
	
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

Recompiler.prototype._injectAfterBranch = function(address)
{
	return this._injectCallback("injectAfterBranch", address);
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

Recompiler.Context = function(memory, optimizations)
{
	this.opt = optimizations;
	this.gprValues = new Uint32Array(34);
	this.known = [true];
	for (var i = 1; i < 34; i++)
		this.known[i] = false;

	this.labels = [];
	this.code = {};
	this.calls = [];
	this.address = 0;
	this.isDelaySlot = false;
	this.opcodes = {};
	this.unimplementedInstructionCounts = {};
	this.jittedInstructions = 0;
	this.cyclesOfLastOperation = 0;
	
	this.memory = memory;
}

Recompiler.Context.prototype.panic = function(error)
{
	throw new Error(error);
}

Recompiler.Context.prototype.recompileOpcode = function(currentAddress, op)
{
	this.address = currentAddress;
	this.jittedInstructions++;
	
	if (op.instruction.cycles === undefined)
		this.panic("Unknown cycle count for " + op.instruction.name);
	
	if (this.isDelaySlot)
		this.cyclesOfLastOperation += op.instruction.cycles;
	else
		this.cyclesOfLastOperation = op.instruction.cycles;
	
	var instructionCode = this[op.instruction.name].apply(this, op.params);

	if (instructionCode === undefined)
		instructionCode = "";

	var addressString = Recompiler.formatHex(currentAddress);
	var opcodeString = Disassembler.getOpcodeAsString(op);
	var commentString = addressString + ": " + opcodeString;
	
	return instructionCode;
}

Recompiler.Context.prototype.countUnimplemented = function(instruction)
{
	if (!(instruction in this.unimplementedInstructionCounts))
		this.unimplementedInstructionCounts[instruction] = 0;
	this.unimplementedInstructionCounts[instruction]++;
}

;(function()
{
	function checkedRead32(address)
	{
		var translated = this.memory.translate(address);
		if (translated.buffer == MemoryMap.unmapped)
			this.panic("reading at unmapped location " + hex(address));
		
		return translated.buffer.u32[translated.offset >>> 2];
	}
	
	Recompiler.prototype.checkedRead32 = checkedRead32;
	
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
	
	Recompiler.Context.prototype.setReg = function(reg, value)
	{
		if (!isFinite(reg) || !isFinite(value))
			this.panic("arguments are not finite");
		
		this.gprValues[reg] = value;
		this.known[reg] = value !== null;
	}
	
	Recompiler.Context.prototype.checkedRead32 = checkedRead32;
	
	Recompiler.Context.prototype.analyzeBranches = function(startAddress)
	{
		var addressesToCompile = [startAddress];
		var visitedAddresses = {};
		
		var self = this;
		function addToAddresses(addr)
		{
			if (self.labels.indexOf(addr) == -1 && addressesToCompile.indexOf(addr) == -1)
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
				
				var instruction = this.checkedRead32(address);
				visitedAddresses[address] = true;
				
				var op = Disassembler.getOpcode(instruction);
				if (op.instruction.name == "j" || op.instruction.name == "jr" || op.instruction.name == "break")
				{
					break;
				}
				else if (op.instruction.name.substr(0, 3) == "jal")
				{
					addToAddresses(address + 8);
				}
				else if (op.instruction.name == "syscall")
				{
					addToAddresses(address + 4);
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
			if (this.known[i])
			{
				result += "this.gpr[" + i + "] = " + this.gprValues[i] + ";\n";
				if (nullify === undefined || nullify)
					this.setReg(i, null);
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
		
		if (this.opt.foldConstants && this.known[reg])
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
		
		var sourceValue = this.gpr(source);
		if (this.opt.foldConstants && isKnown(sourceValue) && isKnown(value))
		{
			this.setReg(dest, eval("sourceValue" + op + "value"));
			return;
		}
		else
		{
			this.setReg(dest, null);
			return this.lgpr(dest) + " = " + sourceValue + " " + op + " " + value + ";\n";
		}
	}
	
	Recompiler.Context.prototype.binaryOpTrap = function(address, op, dest, source, value)
	{
		if (op === undefined || dest === undefined || source === undefined || value === undefined)
			this.panic("undefined argument");
		
		if (dest == 0) return;
		
		var sourceValue = this.gpr(source);
		if (this.opt.foldConstants && isKnown(sourceValue) && isKnown(value))
		{
			var overflowChecked = eval("sourceValue" + op + "value");
			if (overflowChecked > 0xFFFFFFFF || overflowChecked < -0x80000000)
			{
				this.setReg(dest, null);
				return "this.panic('time to implement exceptions', " + address + ");\n";
			}
			else
			{
				this.setReg(dest, overflowChecked);
				return;
			}
		}
		else
		{
			this.setReg(dest, null);
			var jsCode = "overflowChecked = " + sourceValue + " " + op + " " + value + ";\n";
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
		
		if (into == 0) // don't write to r0
			return;
		
		var address = this.gpr(addressReg);
		
		// this.setReg must succeed to this.gpr because it would otherwise wreck
		// havoc on situations like lw t0, t0+5
		this.setReg(into, null);
		offset = signExt(offset, 16);
		if (this.opt.bypassReadMethods && isKnown(address))
		{
			var targetAddress = Recompiler.unsign(address) + offset;
			var translated = this.memory.translate(targetAddress);
			if (translated.buffer == MemoryMap.unmapped)
			{
				var jsCode = "this.psx.diags.warn(\"reading " + bits + " bits from unmapped memory address " + hex(address) + " from PC=" + hex(this.address - 4) + "\");\n";
				jsCode += this.lgpr(into) + " = undefined;\n";
				return jsCode;
			}
			else
			{
				var offsetShift = bits >>> 4;
				var zoneName = translated.buffer.zoneName;
				var bufferOffset = hex(translated.offset >>> offsetShift);
				var reference = "this.memory." + zoneName + ".u" + bits + "[" + bufferOffset + "]";
				var jsCode = this.lgpr(into) + " = ";
				if (signedLoad)
				{
					var shift = 32 - bits;
					jsCode += "(" + reference + " << " + shift + ") >> " + shift;
				}
				else
				{
					jsCode += reference;
				}
				jsCode += ";\n";
				return jsCode;
			}
		}
		else
		{
			if (offset != 0)
				address += " + " + offset;
			
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
			var instruction = this.checkedRead32(delaySlotAddress);
			var delaySlot = Disassembler.getOpcode(instruction);
			if (delaySlot.instruction.name[0] == 'b' || delaySlot.instruction.name[0] == 'j')
				return "this.panic('branch in delay slot is undefined behavior', " + delaySlotAddress + ");\n";
			
			return this.recompileOpcode(delaySlotAddress, delaySlot);
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
		this.countUnimplemented("avsz3");
		return panic("avsz3 is not implemented", this.address - 4);
	});
	
	impl("avsz4", function() {
		this.countUnimplemented("avsz4");
		return panic("avsz4 is not implemented", this.address - 4);
	});
	
	impl("beq", function(s, t, i) {
		return this.branch(this.gpr(s) + " == " + this.gpr(t), i);
	});
	
	impl("beql", function() {
		this.countUnimplemented("beql");
		return panic("beql is not implemented", this.address - 4);
	});
	
	impl("bgez", function(s, i) {
		return this.branch(sign(this.gpr(s)) + " >= 0", i);
	});
	
	impl("bgezal", function() {
		this.countUnimplemented("bgezal");
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
		this.countUnimplemented("bltzal");
		return panic("bltzal is not implemented", this.address - 4);
	});
	
	impl("bne", function(s, t, i) {
		return this.branch(this.gpr(s) + " != " + this.gpr(t), i);
	});
	
	impl("break", function() {
		return panic("breakpoint hit");
	});
	
	impl("cc", function() {
		this.countUnimplemented("cc");
		return panic("cc is not implemented", this.address - 4);
	});
	
	impl("cdp", function() {
		this.countUnimplemented("cdp");
		return panic("cdp is not implemented", this.address - 4);
	});
	
	impl("cfc0", function() {
		this.countUnimplemented("cfc0");
		return panic("cfc0 is not implemented", this.address - 4);
	});
	
	impl("cfc2", function() {
		this.countUnimplemented("cfc2");
		return panic("cfc2 is not implemented", this.address - 4);
	});
	
	impl("ctc0", function() {
		this.countUnimplemented("ctc0");
		return panic("ctc0 is not implemented", this.address - 4);
	});
	
	impl("ctc2", function() {
		this.countUnimplemented("ctc2");
		return panic("ctc2 is not implemented", this.address - 4);
	});
	
	impl("dpcl", function() {
		this.countUnimplemented("dpcl");
		return panic("dpcl is not implemented", this.address - 4);
	});
	
	impl("div", function(s, t) {
		var sVal = this.gpr(s);
		var tVal = this.gpr(t);
		if (this.opt.foldConstants && isKnown(sVal) && isKnown(tVal))
		{
			sVal |= 0;
			tVal |= 0;
			this.setReg(32, sVal % tVal);
			this.setReg(33, sVal / tVal);
			return;
		}
		else
		{
			this.setReg(32, null);
			this.setReg(33, null);
			var jsCode = "this.gpr[32] = " + sign(this.gpr(s)) + " % " + sign(this.gpr(t)) + ";\n";
			jsCode += "this.gpr[33] = " + sign(this.gpr(s)) + " / " + sign(this.gpr(t)) + ";\n";
			return jsCode;
		}
	});
	
	impl("divu", function(s, t) {
		var sVal = this.gpr(s);
		var tVal = this.gpr(t);
		if (this.opt.foldConstants && isKnown(sVal) && isKnown(tVal))
		{
			this.setReg(32, sVal % tVal);
			this.setReg(33, sVal / tVal);
			return;
		}
		else
		{
			this.setReg(32, null);
			this.setReg(33, null);
			var jsCode = "this.gpr[32] = " + this.gpr(s) + " % " + this.gpr(t) + ";\n";
			jsCode += "this.gpr[33] = " + this.gpr(s) + " / " + this.gpr(t) + ";\n";
			return jsCode;
		}
	});
	
	impl("dpcs", function() {
		this.countUnimplemented("dpcs");
		return panic("dpcs is not implemented", this.address - 4);
	});
	
	impl("dpct", function() {
		this.countUnimplemented("dpct");
		return panic("dpct is not implemented", this.address - 4);
	});
	
	impl("gpf", function() {
		this.countUnimplemented("gpf");
		return panic("gpf is not implemented", this.address - 4);
	});
	
	impl("gpl", function() {
		this.countUnimplemented("gpl");
		return panic("gpl is not implemented", this.address - 4);
	});
	
	impl("intpl", function() {
		this.countUnimplemented("intpl");
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
		var jumpAddress = (this.address & 0xF0000000) | (i << 2);
		
		var jsCode = this.delaySlot();
		jsCode += this.flushRegisters();
		jsCode += this.lgpr(31) + " = " + hex(this.address + 4) + ";\n";
		jsCode += "return " + hex(jumpAddress) + ";\n";
		
		return jsCode;
	});
	
	impl("jalr", function(s, d) {
		var jsCode = this.delaySlot();
		jsCode += this.flushRegisters();
		jsCode += this.lgpr(d) + " = " + hex(this.address + 4) + ";\n"
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
		if (this.opt.foldConstants)
			this.setReg(t, i << 16);
		else
			return this.gpr(t) + " = " + (i << 16) + ";\n";
	});
	
	impl("lw", function(s, t, i) {
		return this.load(32, s, i, t, false);
	});
	
	impl("lwc2", function() {
		this.countUnimplemented("lwc2");
		return panic("lwc2 is not implemented", this.address - 4);
	});
	
	impl("lwl", function() {
		this.countUnimplemented("lwl");
		return panic("lwl is not implemented", this.address - 4);
	});
	
	impl("lwr", function() {
		this.countUnimplemented("lwr");
		return panic("lwr is not implemented", this.address - 4);
	});
	
	impl("mfc0", function(t, l) { // t is the gpr, l is the cop0 reg
		this.setReg(t, null);
		return this.lgpr(t) + " = this.cop0_reg[" + l + "];\n";
	});
	
	impl("mfc2", function() {
		this.countUnimplemented("mfc2");
		return panic("mfc2 is not implemented", this.address - 4);
	});
	
	impl("mfhi", function(d) {
		var hi = this.gpr(32);
		if (this.opt.foldConstants && isKnown(hi))
			this.setReg(d, hi);
		else
		{
			this.setReg(d, null);
			return this.lgpr(d) + " = " + hi + ";\n";
		}
	});
	
	impl("mflo", function(d) {
		var lo = this.gpr(33);
		if (this.opt.foldConstants && isKnown(lo))
			this.setReg(d, lo);
		else
		{
			this.setReg(d, null);
			return this.lgpr(d) + " = " + lo + ";\n";
		}
	});
	
	impl("mtc0", function(t, l) {
		return "this.writeCOP0(" + l + ", " + this.gpr(t) + ");\n";
	});
	
	impl("mtc2", function() {
		this.countUnimplemented("mtc2");
		return panic("mtc2 is not implemented", this.address - 4);
	});
	
	impl("mthi", function(d) {
		var dValue = this.gpr(d);
		if (this.opt.foldConstants && isKnown(dValue))
			this.setReg(32, dValue);
		else
		{
			this.setReg(32, null);
			return this.lgpr(32) + " = " + dValue + ";\n";
		}
	});
	
	impl("mtlo", function(d) {
		var dValue = this.gpr(d);
		if (this.opt.foldConstants && isKnown(dValue))
			this.setReg(33, dValue);
		else
		{
			this.setReg(33, null);
			return this.lgpr(33) + " = " + dValue + ";\n";
		}
	});
	
	impl("mult", function() {
		this.countUnimplemented("mult");
		return panic("mult is not implemented", this.address - 4);
	});
	
	impl("multu", function(s, t) {
		var sValue = this.gpr(s);
		var tValue = this.gpr(t);
		if (this.opt.foldConstants && isKnown(sValue) && isKnown(tValue))
		{
			R3000a.runtime.multu(this.gprValues, sValue, tValue);
			this.known[32] = true;
			this.known[33] = true;
		}
		else
		{
			this.setReg(32, null);
			this.setReg(33, null);
			return "R3000a.runtime.multu(this.gpr, " + this.gpr(t) + ", " + this.gpr(s) + ");\n";
		}
	});
	
	impl("mvmva", function() {
		this.countUnimplemented("mvmva");
		return panic("mvmva is not implemented", this.address - 4);
	});
	
	impl("nccs", function() {
		this.countUnimplemented("nccs");
		return panic("nccs is not implemented", this.address - 4);
	});
	
	impl("ncct", function() {
		this.countUnimplemented("ncct");
		return panic("ncct is not implemented", this.address - 4);
	});
	
	impl("ncds", function() {
		this.countUnimplemented("ncds");
		return panic("ncds is not implemented", this.address - 4);
	});
	
	impl("ncdt", function() {
		this.countUnimplemented("ncdt");
		return panic("ncdt is not implemented", this.address - 4);
	});
	
	impl("nclip", function() {
		this.countUnimplemented("nclip");
		return panic("nclip is not implemented", this.address - 4);
	});
	
	impl("ncs", function() {
		this.countUnimplemented("ncs");
		return panic("ncs is not implemented", this.address - 4);
	});
	
	impl("nct", function() {
		this.countUnimplemented("nct");
		return panic("nct is not implemented", this.address - 4);
	});
	
	impl("nor", function(s, t, d) {
		var sValue = this.gpr(s);
		var tValue = this.gpr(t);
		if (this.opt.foldConstants && isKnown(sValue) && isKnown(tValue))
			this.setReg(d, ~(sValue | tValue));
		else
		{
			this.setReg(d, null);
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
		this.countUnimplemented("rtps");
		return panic("rtps is not implemented", this.address - 4);
	});
	
	impl("rtpt", function() {
		this.countUnimplemented("rtpt");
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
		if (this.opt.foldConstants && isKnown(sValue) && isKnown(tValue))
			this.setReg(d, ((sValue | 0) < (tValue | 0)) | 0);
		else
		{
			this.setReg(d, null);
			return this.lgpr(d) + " = " + sign(this.gpr(s)) + " < " + sign(this.gpr(t)) + ";\n";
		}
	});
	
	impl("slti", function(s, t, i) {
		var sValue = this.gpr(s);
		if (this.opt.foldConstants && isKnown(sValue) && isKnown(tValue))
			this.setReg(t, ((sValue | 0) < signExt(i, 16)) | 0);
		else
		{
			this.setReg(t, null);
			return this.lgpr(t) + " = " + sign(this.gpr(s)) + " < " + signExt(i, 16) + ";\n";
		}
	});
	
	impl("sltiu", function(s, t, i) {
		var sValue = this.gpr(s);
		if (this.opt.foldConstants && isKnown(sValue) && isKnown(tValue))
			this.setReg(t, (sValue < Recompiler.unsign(signExt(i, 16))) | 0);
		else
		{
			this.setReg(t, null);
			return this.lgpr(t) + " = " + this.gpr(s) + " < " + i + ";\n";
		}
	});
	
	impl("sltu", function(s, t, d) {
		var sValue = this.gpr(s);
		var tValue = this.gpr(t);
		if (this.opt.foldConstants && isKnown(sValue) && isKnown(tValue))
			this.setReg(d, (Recompiler.unsign(sValue) < Recompiler.unsign(tValue)) | 0);
		else
		{
			this.setReg(d, null);
			return this.lgpr(d) + " = " + this.gpr(s) + " < " + this.gpr(t) + ";\n";
		}
	});
	
	impl("sqr", function() {
		this.countUnimplemented("sqr");
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
		this.countUnimplemented("sub");
		return panic("sub is not implemented", this.address - 4);
	});
	
	impl("subu", function(s, t, d) {
		return this.binaryOp("-", d, s, this.gpr(t));
	});
	
	impl("sw", function(s, t, i) {
		return this.store(32, s, i, t);
	});
	
	impl("swc2", function() {
		this.countUnimplemented("swc2");
		return panic("swc2 is not implemented", this.address - 4);
	});
	
	impl("swl", function() {
		this.countUnimplemented("swl");
		return panic("swl is not implemented", this.address - 4);
	});
	
	impl("swr", function() {
		this.countUnimplemented("swr");
		return panic("swr is not implemented", this.address - 4);
	});
	
	impl("syscall", function() {
		var jsCode = this.flushRegisters();
		jsCode += "return this.raiseException(" + hex(this.address) + ", 0x20, " + this.isDelaySlot + ");\n";
		return jsCode;
	});
	
	impl("xor", function() {
		this.countUnimplemented("xor");
		return panic("xor is not implemented", this.address - 4);
	});
	
	impl("xori", function() {
		// the immediate is NOT sign extended
		this.countUnimplemented("xori");
		return panic("xori is not implemented", this.address - 4);
	});
})();