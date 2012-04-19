var Recompiler = function()
{
	this.memory = null;
	this.code = {};
	this.diags = console;
	
	this.startAddress = null;
	this.compiledAddresses = [];
	this.addressesToCompile = [];
	this.calls = [];
	this.address = 0;
	this.epc = 0; // the place to set EPC in case of an exception
	this.opcodes = {};
	this.injector = null;
}

Recompiler.prototype.recompileFunction = function(memory, startAddress)
{
	if (memory === undefined || startAddress === undefined)
		throw new Error("memory and startAddress must be defined");
	this.memory = memory;
	this.startAddress = startAddress;
	this.code = {};
	
	this.compiledAddresses = [];
	this.addressesToCompile = [startAddress];
	this.calls = [];
	this.address = 0;
	this.epc = 0;
	this.opcodes = {};
	
	this.unimplementedInstructionCounts = {};
	this.jittedInstructions = 0;
	
	// compiled memory ranges
	var ranges = {};
	
	while (this.addressesToCompile.length > 0)
	{
		this.address = this.addressesToCompile.shift();
		this.compiledAddresses.push(this.address);
		
		var rangeStart = this.address;
		while (!(this.address in this.code))
		{
			var currentAddress = this.address;
			this.epc = currentAddress;
			
			var op = this.nextInstruction();
			this.code[currentAddress] = this.recompileOpcode(currentAddress, op);
			
			// a jump means the end of a block
			if (op.instruction.name == "j" || op.instruction.name == "jr")
				break;
		}
		ranges[rangeStart] = this.address;
	}
	
	// collapse compiled code memory ranges
	var keys = [];
	for (var key in ranges) keys.push(parseInt(key));
	keys.sort(function(a, b) { return a - b; });
	
	this.ranges = [];
	for (var i = 0; i < keys.length; i++)
	{
		var start = keys[i];
		if (start === undefined) continue
		
		var end = ranges[start];
		while (end in ranges)
		{
			var newEnd = ranges[end];
			delete ranges[end];
			end = newEnd;
		}
		this.ranges.push([start, end]);
	}
	
	return this.compile();
}

Recompiler.prototype.recompileOpcode = function(currentAddress, op)
{
	var injectedBefore = this._injectBefore(currentAddress, op);
	var injectedAfter = this._injectAfter(currentAddress, op);
	if (injectedBefore === undefined) injectedBefore = '';
	if (injectedAfter === undefined) injectedAfter = '';
	
	var addressString = Recompiler.formatHex(currentAddress);
	var opcodeString = Disassembler.getOpcodeAsString(op);
	var commentString = addressString + ": " + opcodeString;
	var jsComment = "// " + commentString + "\n";
	var instructionCode = this[op.instruction.name].apply(this, op.params);
	if (instructionCode === undefined)
		this.panic(commentString + " was recompiled as undefined");
	
	return injectedBefore + jsComment + instructionCode + injectedAfter;
}

Recompiler.prototype.addLabel = function(label, opAddress)
{
	var labelString = Recompiler.formatHex(label);
	var opAddressString = Recompiler.formatHex(opAddress);
	
	// check that the location actually exists
	var translated = this.memory.translate(label);
	if (translated.buffer == MemoryMap.unmapped)
		this.panic("branch or jump to unmapped location " + labelString + " from address " + opAddressString);
		
	// check that the label is not in a delay slot
	// just warn if so, because the previous word is possibly not an instruction
	var bits = this.memory.read32(label - 4);
	var op = Disassembler.getOpcode(bits);
	if (op != null)
	{
		var firstLetter = op.instruction.name[0];
		if (firstLetter == 'b' || firstLetter == 'j')
		{
			var message = "label " + labelString + " from " + opAddressString + " falling into the delay slot of a branch"
			this.diags.warn(message);
		}
	}

	if (this.compiledAddresses.indexOf(label) == -1)
		this.addressesToCompile.push(label);
}

Recompiler.prototype.match = function(instruction)
{
	for (var i = 0; i < Disassembler.Patterns.length; i++)
	{
		var pattern = Disassembler.Patterns[i];
		var matched = pattern.tryParse(instruction);
		if (matched !== null)
		{
			return {instruction: pattern.name, params: matched};
		}
	}
	return null;
}

Recompiler.prototype.nextInstruction = function()
{
	var translated = this.memory.translate(this.address);
	if (translated.buffer == MemoryMap.unmapped)
		this.panic("accessing invalid memory address " + Recompiler.formatHex(this.address));
	
	var pattern = this.memory.read32(this.address);
	var op = Disassembler.getOpcode(pattern);
	if (op == null) this.panic(pattern, this.address);
	
	this.opcodes[this.address] = op;
	this.address += 4;
	this.jittedInstructions++;
	
	return op;
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

Recompiler.functionPrelude = "var condition = false;\nvar writeAddress = 0;\nvar overflowChecked = 0;\n";

Recompiler.prototype.compile = function()
{
	// the conditional allows to resume a function at a certain label
	var startAddress = "0x" + Recompiler.formatHex(this.startAddress);
	var jsCode = "pc = isFinite(pc) ? pc : " + startAddress + ";\n";
	jsCode += "this.currentFunction = " + startAddress + ";\n"
	jsCode += Recompiler.functionPrelude;
	jsCode += "while (true) {\n";
	jsCode += "switch (pc) {\n";
	
	// keys need to be sorted to be consistent
	var keys = [];
	for (var key in this.code) keys.push(parseInt(key));
	keys.sort(function(a, b) { return a - b; });
	
	// increment the Count register (cp0_reg[9])
	var lastKey = keys[0];
	for (var i = 0; i < keys.length; i++)
	{
		var address = keys[i];
		
		// should we update the Count register?
		var nextAddress = keys[i + 1];
		if (nextAddress == undefined) nextAddress = address + 4;
		var opcodeName = this.opcodes[address].instruction.name;
		var isJump = opcodeName[0] == 'j' || opcodeName[0] == 'b';
		
		// don't add a clock call on the first instruction
		if ((this.compiledAddresses.indexOf(nextAddress) != -1 || isJump) && i != 0)
		{
			jsCode += "this.clock(" + (nextAddress - lastKey) + ");\n\n";
			lastKey = nextAddress;
		}
		
		// should we create a new label?
		if (this.compiledAddresses.indexOf(address) != -1)
			jsCode += "case 0x" + Recompiler.formatHex(address) + ":\n";
		
		jsCode += this.code[address] + "\n";
	}
	
	jsCode += "default: this.panic('unreferenced block 0x' + Recompiler.formatHex(pc), pc); break;\n";
	jsCode += "}\n}";
	
	var functionName = "." + Recompiler.formatHex(this.startAddress);
	var compiled = new Function("pc", "context", jsCode);
	compiled.name = functionName;
	
	return {
		name: functionName,
		code: compiled,
		
		references: this.calls,
		
		ranges: this.ranges,
		totalCount: this.jittedInstructions,
		unimplemented: this.unimplementedInstructionCounts,
	};
}

// recompile one single instruction, useful for stepping
Recompiler.prototype.recompileOne = function(memory, address)
{
	this.memory = memory;
	this.address = address;
	
	var op = this.nextInstruction();
	var code = Recompiler.functionPrelude
		+ "var pc = 0x" + Recompiler.formatHex(address) + " + 4;\n"
		+ "do {\n"
		+ this.recompileOpcode(address, op)
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

Recompiler.prototype._injectBefore = function(address, opcode)
{
	if (this.injector != null && this.injector.injectBefore !== undefined && this.injector.injectBefore.call !== undefined)
		return this.injector.injectBefore.call(this.injector, address, opcode);
	return '';
}

Recompiler.prototype._injectAfter = function(address, opcode)
{
	if (this.injector != null && this.injector.injectAfter !== undefined && this.injector.injectAfter.call !== undefined)
		return this.injector.injectAfter.call(this.injector, address, opcode);
	return '';
}

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

;(function()
{
	/// OPCODES
	/// A MIPS reference can be found at http://www.mrc.uidaho.edu/mrc/people/jff/digital/MIPSir.html
	/// though the page doesn't have the complete reference for the 4300i CPU.
	/// Each opcode function accepts a handful of arguments. These arguments
	/// can be statically decoded, which is pretty cool for recompilation.
	/// BIG TIME HEURISTIC FOR LINKING JUMPS. We're not using the link rgister
	/// at all, just going through the assumption that anything that deals
	/// with it can be safely replaced by a "regular" call.
	function impl(inst, func)
	{
		Recompiler.prototype[inst] = func;
	}
	
	function countUnimplemented(instruction)
	{
		if (!(instruction in this.unimplementedInstructionCounts))
			this.unimplementedInstructionCounts[instruction] = 0;
		this.unimplementedInstructionCounts[instruction]++;
	}
	
	function gpr(reg)
	{
		if (reg === undefined)
			throw new Error("undefined value");
		
		// r0 is always 0
		if (reg === 0) return 0;
		
		return "this.gpr[" + reg + "]";
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
	
	function binaryOp(op, dest, source, value)
	{
		if (op === undefined || dest === undefined || source === undefined || value === undefined)
			this.panic("undefined argument");
		
		if (dest == 0) return ";\n";
		if (dest == source)
			return gpr(dest) + " " + op + "= " + value + ";\n";
		
		return gpr(dest) + " = " + gpr(source) + " " + op + " " + value + ";\n";
	}
	
	function binaryOpTrap(address, op, dest, source, value)
	{
		if (op === undefined || dest === undefined || source === undefined || value === undefined)
			this.panic("undefined argument");
		
		if (dest == 0) return ";\n";
		var jsCode = "overflowChecked = " + gpr(source) + " " + op + " " + value + ";\n";
		jsCode += "if (overflowChecked > 0xFFFFFFFF || overflowChecked < -0x80000000)\n";
		// TODO implement overflow exceptions
		jsCode += "\tthis.panic('time to implement exceptions', " + address + ");\n";
		jsCode += gpr(dest) + " = overflowChecked;\n";
		return jsCode;
	}
	
	function load(bits, addressReg, offset, into, signedLoad)
	{
		if (bits === undefined || addressReg === undefined || offset === undefined || into === undefined)
			this.panic("undefined argument");
		
		var address = gpr(addressReg);
		offset = signExt(offset, 16);
		address += " + " + offset;
		
		if (signedLoad)
		{
			var shift = 32 - bits;
			return gpr(into) + " = (this.memory.read" + bits + "(" + address + ") << " + shift + ") >> " + shift + ";\n";
		}
		else
		{
			return gpr(into) + " = this.memory.read" + bits + "(" + address + ");\n";
		}
	}
	
	function store(bits, addressReg, offset, value)
	{
		if (bits === undefined || addressReg === undefined || offset === undefined || value === undefined)
			this.panic("undefined argument");
		
		var address = gpr(addressReg);
		offset = signExt(offset, 16);
		address += " + " + offset;
		
		var jsCode = "this.memory.write" + bits + "(" + address + ", " + gpr(value) + ");\n";
		jsCode += "this.invalidate(" + address + ");\n";
		return jsCode;
	}
	
	function delaySlot()
	{
		var delaySlot = this.nextInstruction();
		if (delaySlot.instruction.name[0] == 'b' || delaySlot.instruction.name[0] == 'j')
			return "this.panic('branch in delay slot is undefined behavior', " + (this.address - 4) + ");\n";
		var jsCode = "// delay slot: " + Disassembler.getOpcodeAsString(delaySlot) + "\n";
		jsCode += this[delaySlot.instruction.name].apply(this, delaySlot.params);
		return jsCode;
	}
	
	function jump(targetWord)
	{
		var opAddress = this.address - 4;
		var jumpAddress = Recompiler.unsign((opAddress & 0xF0000000) | (targetWord << 2));
		this.addLabel(jumpAddress, opAddress);
		
		var jsCode = "pc = " + hex(jumpAddress) + ";\n";
		jsCode += delaySlot.call(this);
		jsCode += "break;\n";
		return jsCode;
	}
	
	function branch(condition, offset)
	{
		var opAddress = this.address;
		var targetAddress = Recompiler.unsign(opAddress + (signExt(offset, 16) << 2));
		this.addLabel(targetAddress, opAddress);
		
		var jsCode = "condition = " + condition + ";\n";
		jsCode += delaySlot.call(this);
		jsCode += "if (condition) {\n";
		jsCode += "pc = " + hex(targetAddress) + ";\n";
		jsCode += "break;\n";
		jsCode += "}\n";
		return jsCode;
	}
	
	impl("add", function(s, t, d) {
		return binaryOpTrap(this.address - 4, "+", d, s, gpr(t));
	});
	
	impl("addi", function(s, t, i) {
		return binaryOpTrap(this.address - 4, "+", t, s, signExt(i, 16));
	});
	
	impl("addiu", function(s, t, i) {
		return binaryOp("+", t, s, signExt(i, 16));
	});
	
	impl("addu", function(s, t, d) {
		return binaryOp("+", d, s, gpr(t));
	});
	
	impl("and", function(s, t, d) {
		return binaryOp("&", d, s, gpr(t));
	});
	
	impl("andi", function(s, t, i) {
		return binaryOp("&", t, s, signExt(i, 16));
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
		return branch.call(this, gpr(s) + " == " + gpr(t), i);
	});
	
	impl("beql", function() {
		countUnimplemented.call(this, "beql");
		return panic("beql is not implemented", this.address - 4);
	});
	
	impl("bgez", function(s, i) {
		return branch.call(this, gpr(s) + " >= 0", i);
	});
	
	impl("bgezal", function() {
		countUnimplemented.call(this, "bgezal");
		return panic("bgezal is not implemented", this.address - 4);
	});
	
	impl("bgtz", function(s, i) {
		return branch.call(this, gpr(s) + " > 0", i);
	});
	
	impl("blez", function(s, i) {
		return branch.call(this, gpr(s) + " <= 0", i);
	});
	
	impl("bltz", function(s, i) {
		return branch.call(this, gpr(s) + " < 0", i);
	});
	
	impl("bltzal", function() {
		countUnimplemented.call(this, "bltzal");
		return panic("bltzal is not implemented", this.address - 4);
	});
	
	impl("bne", function(s, t, i) {
		return branch.call(this, gpr(s) + " != " + gpr(t), i);
	});
	
	impl("break", function() {
		countUnimplemented.call(this, "break");
		return panic("break is not implemented", this.address - 4);
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
	
	impl("div", function() {
		countUnimplemented.call(this, "div");
		return panic("div is not implemented", this.address - 4);
	});
	
	impl("divu", function() {
		countUnimplemented.call(this, "divu");
		return panic("divu is not implemented", this.address - 4);
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
		return jump.call(this, i);
	});
	
	impl("jal", function(i) {
		var jumpAddress = ((this.address - 4) & 0xF0000000) | (i << 2);
		
		var jsCode = delaySlot.call(this);
		jsCode += gpr(31) + " = " + hex(this.address) + ";\n";
		jsCode += "this.execute(" + hex(jumpAddress) + ", context);\n";
		return jsCode;
	});
	
	impl("jalr", function(s, d) {
		var jsCode = delaySlot.call(this);
		jsCode += gpr(d) + " = " + hex(this.address) + ";\n"
		jsCode += "this.execute(" + gpr(s) + ", context);\n";
		return jsCode;
	});
	
	impl("jr", function(s) {
		var jsCode = delaySlot.call(this);
		
		// 'jr ra' usually means 'return'
		if (s == 31)
			jsCode += "return;\n";
		else
		{
			jsCode += "this.execute(" + gpr(s) + ", context);\n";
			jsCode += "return;\n";
		}
		return jsCode;
	});
	
	impl("lb", function(s, t, i) {
		return load(8, s, i, t, true);
	});
	
	impl("lbu", function(s, t, i) {
		return load(8, s, i, t, false);
	});
	
	impl("lh", function() {
		countUnimplemented.call(this, "lh");
		return panic("lh is not implemented", this.address - 4);
	});
	
	impl("lhu", function() {
		countUnimplemented.call(this, "lhu");
		return panic("lhu is not implemented", this.address - 4);
	});
	
	impl("lui", function(t, i) {
		return gpr(t) + " = " + hex(i << 16) + ";\n";
	});
	
	impl("lw", function(s, t, i) {
		return load(32, s, i, t);
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
		return gpr(t) + " = this.cop0_reg[" + l + "];\n";
	});
	
	impl("mfc2", function() {
		countUnimplemented.call(this, "mfc2");
		return panic("mfc2 is not implemented", this.address - 4);
	});
	
	impl("mfhi", function() {
		countUnimplemented.call(this, "mfhi");
		return panic("mfhi is not implemented", this.address - 4);
	});
	
	impl("mflo", function() {
		countUnimplemented.call(this, "mflo");
		return panic("mflo is not implemented", this.address - 4);
	});
	
	impl("mtc0", function(t, l) {
		return "this.writeCOP0(" + l + ", " + gpr(t) + ")\n";
	});
	
	impl("mtc2", function() {
		countUnimplemented.call(this, "mtc2");
		return panic("mtc2 is not implemented", this.address - 4);
	});
	
	impl("mthi", function() {
		countUnimplemented.call(this, "mthi");
		return panic("mthi is not implemented", this.address - 4);
	});
	
	impl("mtlo", function() {
		countUnimplemented.call(this, "mtlo");
		return panic("mtlo is not implemented", this.address - 4);
	});
	
	impl("mult", function() {
		countUnimplemented.call(this, "mult");
		return panic("mult is not implemented", this.address - 4);
	});
	
	impl("multu", function() {
		countUnimplemented.call(this, "multu");
		return panic("multu is not implemented", this.address - 4);
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
	
	impl("nor", function() {
		countUnimplemented.call(this, "nor");
		return panic("nor is not implemented", this.address - 4);
	});
	
	impl("or", function(s, t, d) {
		return binaryOp("|", d, s, gpr(t));
	});
	
	impl("ori", function(s, t, i) {
		return binaryOp("|", t, s, hex(i));
	});
	
	impl("rfe", function() {
		countUnimplemented.call(this, "rfe");
		return panic("rfe is not implemented", this.address - 4);
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
		return store(8, s, i, t);
	});
	
	impl("sh", function(s, t, i) {
		return store(16, s, i, t);
	});
	
	impl("sll", function(t, d, i) { // why does it have an 's' register?
		return binaryOp("<<", d, t, hex(i));
	});
	
	impl("sllv", function() {
		countUnimplemented.call(this, "sllv");
		return panic("sllv is not implemented", this.address - 4);
	});
	
	impl("slt", function() {
		countUnimplemented.call(this, "slt");
		return panic("slt is not implemented", this.address - 4);
	});
	
	impl("slti", function() {
		countUnimplemented.call(this, "slti");
		return panic("slti is not implemented", this.address - 4);
	});
	
	impl("sltiu", function() {
		countUnimplemented.call(this, "sltiu");
		return panic("sltiu is not implemented", this.address - 4);
	});
	
	impl("sltu", function(s, t, d) {
		return gpr(d) + " = " + gpr(s) + " < " + gpr(t) + ";\n";
	});
	
	impl("sqr", function() {
		countUnimplemented.call(this, "sqr");
		return panic("sqr is not implemented", this.address - 4);
	});
	
	impl("sra", function(t, d, i) {
		return binaryOp(">>", d, t, i);
	});
	
	impl("srav", function(s, t, d) {
		return binaryOp(">>", d, t, gpr(s));
	});
	
	impl("srl", function(t, d, i) {
		return binaryOp(">>>", d, t, i);
	});
	
	impl("srlv", function() {
		countUnimplemented.call(this, "srlv");
		return panic("srlv is not implemented", this.address - 4);
	});
	
	impl("sub", function() {
		countUnimplemented.call(this, "sub");
		return panic("sub is not implemented", this.address - 4);
	});
	
	impl("subu", function(s, t, d) {
		return binaryOp("-", d, s, t);
	});
	
	impl("sw", function(s, t, i) {
		return store(32, s, i, t);
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
		countUnimplemented.call(this, "syscall");
		return panic("syscall is not implemented", this.address - 4);
	});
	
	impl("xor", function() {
		countUnimplemented.call(this, "xor");
		return panic("xor is not implemented", this.address - 4);
	});
	
	impl("xori", function() {
		countUnimplemented.call(this, "xori");
		return panic("xori is not implemented", this.address - 4);
	});
})();