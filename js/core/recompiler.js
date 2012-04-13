Recompiler = function()
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
	var addressString = Recompiler.formatHex32(currentAddress);
	var opcodeString = Disassembler.getOpcodeAsString(op);
	var commentString = addressString + ": " + opcodeString;
	var jsComment = "// " + commentString + "\n";
	var instructionCode = this[op.instruction.name].apply(this, op.params);
	if (instructionCode === undefined)
		this.panic(commentString + " was recompiled as undefined");
	
	return jsComment + instructionCode;
}

Recompiler.unsign = function(x)
{
	var lastBit = x & 1;
	return (x >>> 1) * 2 + lastBit;
}

Recompiler.formatHex32 = function(address)
{
	var output = Recompiler.unsign(address).toString(16);
	while (output.length != 8)
		output = 0 + output;
	return output;
}

Recompiler.prototype.addLabel = function(label)
{
	var labelString = Recompiler.formatHex32(label);
	// check that the location actually exists
	var physicalAddress = this.memory.translate(label);
	if (physicalAddress == this.memory.invalidAddress)
		this.panic("branch or jump to unmapped location " + labelString);
		
	// check that the label is not in a delay slot
	// just warn if so, because the previous word is possibly not an instruction
	var bits = this.memory.read32(label - 4);
	var op = Disassembler.getOpcode(bits);
	if (op != null)
	{
		var firstLetter = op.instruction.name[0];
		if (firstLetter == 'b' || firstLetter == 'j')
			this.diags.warn("label " + labelString + " falling into the delay slot of a branch");
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
	if (translated >= this.memory.invalidAddress)
		this.panic("accessing invalid memory address " + Recompiler.formatHex32(this.address));
	
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
		throw new Error("No matching instruction for pattern " + binary + " at " + Recompiler.formatHex32(address));
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
	var startAddress = "0x" + Recompiler.formatHex32(this.startAddress);
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
		
		if (this.compiledAddresses.indexOf(nextAddress) != -1 || isJump)
		{
			jsCode += "this.clock(" + (nextAddress - lastKey) + ");\n\n";
			lastKey = nextAddress;
		}
		
		// should we create a new label?
		if (this.compiledAddresses.indexOf(address) != -1)
			jsCode += "case 0x" + Recompiler.formatHex32(address) + ":\n";
		
		jsCode += this.code[address] + "\n";
	}
	
	jsCode += "default: this.panic('unreferenced block 0x' + Recompiler.formatHex32(pc)); break;\n";
	jsCode += "}\n}";
	
	var functionName = "." + Recompiler.formatHex32(this.startAddress);
	var compiled = new Function("pc", jsCode);
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
		+ "var pc = 0x" + Recompiler.formatHex32(address) + " + 4;\n"
		+ "do {\n"
		+ this.recompileOpcode(address, op)
		+ "} while (false);\n";
	
	// account for the delay slot, it needs to be skipped
	if (op.instruction.name[0] == 'b' || op.instruction.name[0] == 'j')
		code += "pc += 4;\n";
	
	code += "return pc;\n";
	
	this.address = 0;
	this.memory = null;
	
	return new Function(code);
}

// recompile until we hit a branch, useful for running until a given address
Recompiler.prototype.recompileBlock = function(memory, address, maxAddress)
{
	this.memory = memory;
	this.address = address;
	
	var code = Recompiler.functionPrelude
		+ "var pc = 0x" + Recompiler.formatHex32(address) + " + 4;\n"
		+ "switch (0) {\n" + "case 0:\n";
	
	do
	{
		var currentAddress = this.address;
		var op = this.nextInstruction();
		code += this.recompileOpcode(currentAddress, op);
	} while (op.instruction.name[0] != 'b' && this.address != maxAddress);
	
	code += "pc = 0x" + Recompiler.formatHex32(this.address) + ";\n";
	code += "}\n" + "return pc;\n";
	
	this.address = 0;
	this.memory = null;
	
	return new Function(code);
};

(function()
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
		return "0x" + Recompiler.formatHex32(x);
	}
	
	function panic(message)
	{
		return "this.panic('" + message + "');\n";
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
	
	function binaryOpTrap(op, dest, source, value)
	{
		if (op === undefined || dest === undefined || source === undefined || value === undefined)
			this.panic("undefined argument");
		
		if (dest == 0) return ";\n";
		var jsCode = "overflowChecked = " + gpr(source) + " " + op + " " + value + ";\n";
		jsCode += "if (overflowChecked > 0xFFFFFFFF || overflowChecked < -0x80000000)\n";
		// TODO implement overflow exceptions
		jsCode += "\tthis.panic('time to implement exceptions');\n";
		jsCode += gpr(dest) + " = overflowChecked;\n";
		return jsCode;
	}
	
	function load(bits, addressReg, offset, into)
	{
		if (bits === undefined || addressReg === undefined || offset === undefined || into === undefined)
			this.panic("undefined argument");
		
		var address = gpr(addressReg);
		if (offset != 0)
			address += " + " + hex(offset);
		
		var jsCode = gpr(into) + " = this.memory.read" + bits + "(" + address + ")\n";
		return jsCode;
	}
	
	function store(bits, addressReg, offset, value)
	{
		if (bits === undefined || addressReg === undefined || offset === undefined || value === undefined)
			this.panic("undefined argument");
		
		var address = gpr(addressReg);
		if (offset != 0)
			address += " + " + hex(offset);
		
		var jsCode = "this.memory.write" + bits + "(" + address + ", " + gpr(value) + ");\n";
		jsCode += "this.invalidate(" + address + ");\n";
		return jsCode;
	}
	
	function delaySlot()
	{
		var delaySlot = this.nextInstruction();
		if (delaySlot.instruction.name[0] == 'b' || delaySlot.instruction.name[0] == 'j')
			return "this.panic('branch in delay slot is undefined behavior');\n";
		var jsCode = "// delay slot: " + Disassembler.getOpcodeAsString(delaySlot) + "\n";
		jsCode += this[delaySlot.instruction.name].apply(this, delaySlot.params);
		return jsCode;
	}
	
	function jump(targetWord)
	{
		var jumpAddress = Recompiler.unsign(((this.address - 4) & 0xF0000000) | (targetWord << 2));
		this.addLabel(jumpAddress);
		
		var jsCode = "pc = " + hex(jumpAddress) + ";\n";
		jsCode += delaySlot.call(this);
		jsCode += "break;\n";
		return jsCode;
	}
	
	function branch(condition, offset)
	{
		var currentAddress = this.address;
		var targetAddress = Recompiler.unsign(currentAddress + (signExt(offset, 16) << 2));
		this.addLabel(targetAddress);
		
		var jsCode = "condition = " + condition + ";\n";
		jsCode += delaySlot.call(this);
		jsCode += "if (condition) {\n";
		jsCode += "pc = " + hex(targetAddress) + ";\n";
		jsCode += "break;\n";
		jsCode += "}\n";
		return jsCode;
	}
	
	impl("add", function() {
		countUnimplemented.call(this, "add");
		return panic("add is not implemented");
	});
	
	impl("addi", function(s, t, i) {
		return binaryOpTrap("+", t, s, hex(signExt(i, 16)));
	});
	
	impl("addiu", function(s, t, i) {
		return binaryOp("+", t, s, hex(i));
	});
	
	impl("addu", function(s, t, d) {
		return binaryOp("+", s, d, t);
	});
	
	impl("and", function() {
		countUnimplemented.call(this, "and");
		return panic("and is not implemented");
	});
	
	impl("andi", function(s, t, i) {
		return binaryOp("&", t, s, hex(i));
	});
	
	impl("avsz3", function() {
		countUnimplemented.call(this, "avsz3");
		return panic("avsz3 is not implemented");
	});
	
	impl("avsz4", function() {
		countUnimplemented.call(this, "avsz4");
		return panic("avsz4 is not implemented");
	});
	
	impl("beq", function(s, t, i) {
		return branch.call(this, gpr(s) + " == " + gpr(t), i);
	});
	
	impl("beql", function() {
		countUnimplemented.call(this, "beql");
		return panic("beql is not implemented");
	});
	
	impl("bgez", function() {
		countUnimplemented.call(this, "bgez");
		return panic("bgez is not implemented");
	});
	
	impl("bgezal", function() {
		countUnimplemented.call(this, "bgezal");
		return panic("bgezal is not implemented");
	});
	
	impl("bgtz", function() {
		countUnimplemented.call(this, "bgtz");
		return panic("bgtz is not implemented");
	});
	
	impl("blez", function() {
		countUnimplemented.call(this, "blez");
		return panic("blez is not implemented");
	});
	
	impl("bltz", function() {
		countUnimplemented.call(this, "bltz");
		return panic("bltz is not implemented");
	});
	
	impl("bltzal", function() {
		countUnimplemented.call(this, "bltzal");
		return panic("bltzal is not implemented");
	});
	
	impl("bne", function(s, t, i) {
		return branch.call(this, gpr(s) + " != " + gpr(t), i);
	});
	
	impl("break", function() {
		countUnimplemented.call(this, "break");
		return panic("break is not implemented");
	});
	
	impl("cc", function() {
		countUnimplemented.call(this, "cc");
		return panic("cc is not implemented");
	});
	
	impl("cdp", function() {
		countUnimplemented.call(this, "cdp");
		return panic("cdp is not implemented");
	});
	
	impl("cfc0", function() {
		countUnimplemented.call(this, "cfc0");
		return panic("cfc0 is not implemented");
	});
	
	impl("cfc2", function() {
		countUnimplemented.call(this, "cfc2");
		return panic("cfc2 is not implemented");
	});
	
	impl("ctc0", function() {
		countUnimplemented.call(this, "ctc0");
		return panic("ctc0 is not implemented");
	});
	
	impl("ctc2", function() {
		countUnimplemented.call(this, "ctc2");
		return panic("ctc2 is not implemented");
	});
	
	impl("dpcl", function() {
		countUnimplemented.call(this, "dpcl");
		return panic("dpcl is not implemented");
	});
	
	impl("div", function() {
		countUnimplemented.call(this, "div");
		return panic("div is not implemented");
	});
	
	impl("divu", function() {
		countUnimplemented.call(this, "divu");
		return panic("divu is not implemented");
	});
	
	impl("dpcs", function() {
		countUnimplemented.call(this, "dpcs");
		return panic("dpcs is not implemented");
	});
	
	impl("dpct", function() {
		countUnimplemented.call(this, "dpct");
		return panic("dpct is not implemented");
	});
	
	impl("gpf", function() {
		countUnimplemented.call(this, "gpf");
		return panic("gpf is not implemented");
	});
	
	impl("gpl", function() {
		countUnimplemented.call(this, "gpl");
		return panic("gpl is not implemented");
	});
	
	impl("intpl", function() {
		countUnimplemented.call(this, "intpl");
		return panic("intpl is not implemented");
	});
	
	impl("j", function(i) {
		return jump.call(this, i);
	});
	
	impl("jal", function(i) {
		var jumpAddress = ((this.address - 4) & 0xF0000000) | (i << 2);
		return delaySlot.call(this) + "this.execute(" + hex(jumpAddress) + ");\n";
	});
	
	impl("jalr", function(s, d) {
		var jsCode = delaySlot.call(this);
		jsCode += gpr(d) + " = " + hex(this.address) + ";\n"
		jsCode += "this.execute(" + gpr(s) + ");\n";
		return jsCode;
	});
	
	impl("jr", function(s) {
		var jsCode = delaySlot.call(this);
		
		// 'jr ra' usually means 'return'
		if (s == 31)
			jsCode += "return;\n";
		else
		{
			jsCode += "this.execute(" + gpr(s) + ");\n";
			jsCode += "return;\n";
		}
		return jsCode;
	});
	
	impl("lb", function(s, t, i) {
		return load(8, s, i, t);
	});
	
	impl("lbu", function() {
		countUnimplemented.call(this, "lbu");
		return panic("lbu is not implemented");
	});
	
	impl("lh", function() {
		countUnimplemented.call(this, "lh");
		return panic("lh is not implemented");
	});
	
	impl("lhu", function() {
		countUnimplemented.call(this, "lhu");
		return panic("lhu is not implemented");
	});
	
	impl("lui", function(t, i) {
		return gpr(t) + " = 0x" + Recompiler.unsign(i << 16).toString(16) + ";\n";
	});
	
	impl("lw", function(s, t, i) {
		return load(32, s, i, t);
	});
	
	impl("lwc2", function() {
		countUnimplemented.call(this, "lwc2");
		return panic("lwc2 is not implemented");
	});
	
	impl("lwl", function() {
		countUnimplemented.call(this, "lwl");
		return panic("lwl is not implemented");
	});
	
	impl("lwr", function() {
		countUnimplemented.call(this, "lwr");
		return panic("lwr is not implemented");
	});
	
	impl("mfc0", function() {
		countUnimplemented.call(this, "mfc0");
		return panic("mfc0 is not implemented");
	});
	
	impl("mfc2", function() {
		countUnimplemented.call(this, "mfc2");
		return panic("mfc2 is not implemented");
	});
	
	impl("mfhi", function() {
		countUnimplemented.call(this, "mfhi");
		return panic("mfhi is not implemented");
	});
	
	impl("mflo", function() {
		countUnimplemented.call(this, "mflo");
		return panic("mflo is not implemented");
	});
	
	impl("mtc0", function(t, l) {
		return "this.writeCOP0(" + l + ", " + gpr(t) + ")\n";
	});
	
	impl("mtc2", function() {
		countUnimplemented.call(this, "mtc2");
		return panic("mtc2 is not implemented");
	});
	
	impl("mthi", function() {
		countUnimplemented.call(this, "mthi");
		return panic("mthi is not implemented");
	});
	
	impl("mtlo", function() {
		countUnimplemented.call(this, "mtlo");
		return panic("mtlo is not implemented");
	});
	
	impl("mult", function() {
		countUnimplemented.call(this, "mult");
		return panic("mult is not implemented");
	});
	
	impl("multu", function() {
		countUnimplemented.call(this, "multu");
		return panic("multu is not implemented");
	});
	
	impl("mvmva", function() {
		countUnimplemented.call(this, "mvmva");
		return panic("mvmva is not implemented");
	});
	
	impl("nccs", function() {
		countUnimplemented.call(this, "nccs");
		return panic("nccs is not implemented");
	});
	
	impl("ncct", function() {
		countUnimplemented.call(this, "ncct");
		return panic("ncct is not implemented");
	});
	
	impl("ncds", function() {
		countUnimplemented.call(this, "ncds");
		return panic("ncds is not implemented");
	});
	
	impl("ncdt", function() {
		countUnimplemented.call(this, "ncdt");
		return panic("ncdt is not implemented");
	});
	
	impl("nclip", function() {
		countUnimplemented.call(this, "nclip");
		return panic("nclip is not implemented");
	});
	
	impl("ncs", function() {
		countUnimplemented.call(this, "ncs");
		return panic("ncs is not implemented");
	});
	
	impl("nct", function() {
		countUnimplemented.call(this, "nct");
		return panic("nct is not implemented");
	});
	
	impl("nor", function() {
		countUnimplemented.call(this, "nor");
		return panic("nor is not implemented");
	});
	
	impl("or", function(s, t, d) {
		return binaryOp("|", d, s, gpr(t));
	});
	
	impl("ori", function(s, t, i) {
		return binaryOp("|", t, s, hex(i));
	});
	
	impl("rfe", function() {
		countUnimplemented.call(this, "rfe");
		return panic("rfe is not implemented");
	});
	
	impl("rtps", function() {
		countUnimplemented.call(this, "rtps");
		return panic("rtps is not implemented");
	});
	
	impl("rtpt", function() {
		countUnimplemented.call(this, "rtpt");
		return panic("rtpt is not implemented");
	});
	
	impl("sb", function(s, t, i) {
		return store(8, t, i, s);
	});
	
	impl("sh", function(s, t, i) {
		return store(16, t, i, s);
	});
	
	impl("sll", function(t, d, i) { // why does it have an 's' register?
		return binaryOp("<<", d, t, hex(i));
	});
	
	impl("sllv", function() {
		countUnimplemented.call(this, "sllv");
		return panic("sllv is not implemented");
	});
	
	impl("slt", function() {
		countUnimplemented.call(this, "slt");
		return panic("slt is not implemented");
	});
	
	impl("slti", function() {
		countUnimplemented.call(this, "slti");
		return panic("slti is not implemented");
	});
	
	impl("sltiu", function() {
		countUnimplemented.call(this, "sltiu");
		return panic("sltiu is not implemented");
	});
	
	impl("sltu", function(s, t, d) {
		return gpr(d) + " = " + gpr(s) + " < " + gpr(t) + ";\n";
	});
	
	impl("sqr", function() {
		countUnimplemented.call(this, "sqr");
		return panic("sqr is not implemented");
	});
	
	impl("sra", function() {
		countUnimplemented.call(this, "sra");
		return panic("sra is not implemented");
	});
	
	impl("srav", function() {
		countUnimplemented.call(this, "srav");
		return panic("srav is not implemented");
	});
	
	impl("srl", function(t, d, i) {
		return binaryOp(">>>", d, t, i);
	});
	
	impl("srlv", function() {
		countUnimplemented.call(this, "srlv");
		return panic("srlv is not implemented");
	});
	
	impl("sub", function() {
		countUnimplemented.call(this, "sub");
		return panic("sub is not implemented");
	});
	
	impl("subu", function() {
		countUnimplemented.call(this, "subu");
		return panic("subu is not implemented");
	});
	
	impl("sw", function(s, t, i) {
		return store(32, s, i, t);
	});
	
	impl("swc2", function() {
		countUnimplemented.call(this, "swc2");
		return panic("swc2 is not implemented");
	});
	
	impl("swl", function() {
		countUnimplemented.call(this, "swl");
		return panic("swl is not implemented");
	});
	
	impl("swr", function() {
		countUnimplemented.call(this, "swr");
		return panic("swr is not implemented");
	});
	
	impl("syscall", function() {
		countUnimplemented.call(this, "syscall");
		return panic("syscall is not implemented");
	});
	
	impl("xor", function() {
		countUnimplemented.call(this, "xor");
		return panic("xor is not implemented");
	});
	
	impl("xori", function() {
		countUnimplemented.call(this, "xori");
		return panic("xori is not implemented");
	});
})();