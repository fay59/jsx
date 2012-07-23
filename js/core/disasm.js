Disassembler = function(cartridge, index)
{
	this.memory = cartridge.memory;
	this.pc = index === undefined ? cartridge.main >>> 2 : index;
}

Disassembler.prototype.getMemoryIndex = function() { return this.pc; }

Disassembler.prototype.getOpcode = function()
{
	return Disassembler.getOpcode(this.memory.read32(this.pc));
}

Disassembler.prototype.getOpcodeAsString = function()
{
	var opcode = this.getOpcode();
	return Diassembler.getOpcodeAsString(opcode);
}

Disassembler.prototype.next = function() { this.pc += 4; }

Disassembler.getOpcode = function(instruction)
{
	for (var i = 0; i < Disassembler.patterns.length; i++)
	{
		var pattern = Disassembler.patterns[i];
		var matched = pattern.tryParse(instruction);
		if (matched !== null)
		{
			return {instruction: pattern, params: matched};
		}
	}
	return null;
}

Disassembler.getOpcodeAsString = function(opcode)
{
	function unsign(x)
	{
		var bit = x & 1;
		return (x >>> 1) * 2 + bit;
	}
	
	if (opcode == null)
		return undefined;
	
	// special case for the nop
	if (opcode.instruction.name == "sll" && opcode.params[0] == 0)
		return "nop";
	
	var instr = opcode.instruction;
	var format = Disassembler.patternData[instr.name].format;
	
	var i = 0;
	for (var key in instr.variables)
	{
		var param = opcode.params[i];
		switch (key)
		{
		case 'i':
			if (format.indexOf('{i<<2}') != -1)
			{
				var jump = (param & 0xFFFF0000) == 0 ? (param << 16) >> 14 : param << 2;
				format = format.replace('{i<<2}', unsign(jump).toString(16));
			}
			else
			{
				format = format.replace('{i}', param.toString(16));
			}
			break;
		
		case 's':
		case 'd':
		case 't':
			format = format.replace('{' + key + '}', Disassembler.registerNames[param]);
			break;
		
		case 'l':
			format = format.replace('{' + key + '}', Disassembler.cop0RegisterNames[param]);
			break;
			
		default:
			format = format.replace('{' + key + '}', param);
			break;
		}
		i++;
	}
	return format;
}

Disassembler.registerNames = [
	"r0", "at", "v0", "v1", "a0", "a1", "a2", "a3", "t0", "t1", "t2", "t3", "t4",
	"t5", "t6", "t7", "s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "t8", "t9",
	"k0", "k1", "gp", "sp", "s8", "ra"
];

Disassembler.cop0RegisterNames = [
	"Index", "Random", "EntryLo0", "BreakPC", "Context", "BreakData", "PIDMask",
	"DCIC", "BadVAddr", "BreakMask", "EntryHi", "BreakCnt", "SR", "Cause", "EPC",
	"PRId", "ErrReg"
];

// byte: 1 byte
// halfword: 2 bytes:
// word: 4 bytes
// dword: 8 bytes
// 0100 0110 0000 0000 0010 1010 1000 0101
Disassembler.patternData = {
	'add': {	// add word
		pattern: '0000 00ss ssst tttt dddd d000 0010 0000',
		format: 'add {d}, {s}, {t}',
		cycles: 1,
	},
	'addi': {	// add immediate word
		pattern: '0010 00ss ssst tttt iiii iiii iiii iiii',
		format: 'addi {t}, {s}, {i}',
		cycles: 1,
	},
	'addiu': {	// add immediate unsigned word
		pattern: '0010 01ss ssst tttt iiii iiii iiii iiii',
		format: 'addiu {t}, {s}, {i}',
		cycles: 1,
	},
	'addu': {	// add unsigned word
		pattern: '0000 00ss ssst tttt dddd d000 0010 0001',
		format: 'addu {d}, {s}, {t}',
		cycles: 1,
	},
	'and': {	// and
		pattern: '0000 00ss ssst tttt dddd d000 0010 0100',
		format: 'and {d}, {s}, {t}',
		cycles: 1,
	},
	'andi': {	// and immediate
		pattern: '0011 00ss ssst tttt iiii iiii iiii iiii',
		format:  'andi {t}, {s}, {i}',
		cycles: 1,
	},
	'avsz3': {	// z-average 3 values
		pattern: '0100 1001 0101 1000 0000 0000 0010 1101',
		format:  'avsz3'
	},
	'avsz4': {	// z-average 4 values
		pattern: '0100 1000 0001 1000 0000 0000 0000 0001',
		format: 'avsz4'
	},
	'beq': {	// branch on equal
		pattern: '0001 00ss ssst tttt iiii iiii iiii iiii',
		format: 'beq {s}, {t}, {i<<2}',
		cycles: 1,
	},
	'beql': {	// branch on equal likely
		pattern: '0101 00ss ssst tttt iiii iiii iiii iiii',
		format: 'beql {s}, {t}, {i<<2}',
		cycles: 1,
	},
	'bgez': {	// branch on greater than or equal to zero
		pattern: '0000 01ss sss0 0001 iiii iiii iiii iiii',
		format: 'bgez {s}, {i<<2}',
		cycles: 1,
	},
	'bgezal': {	// branch on greater than or equal to zero likely
		pattern: '0000 01ss sss1 0001 iiii iiii iiii iiii',
		format: 'bgezal {s}, {i<<2}',
		cycles: 1,
	},
	'bgtz': {	// branch on greater than zero
		pattern: '0001 11ss sss0 0000 iiii iiii iiii iiii',
		format: 'bgtz {s}, {i<<2}',
		cycles: 1,
	},
	'blez': {	// branch on less than or equal to zero
		pattern: '0001 10ss sss0 0000 iiii iiii iiii iiii',
		format: 'blez {s}, {i<<2}',
		cycles: 1,
	},
	'bltz': {	// branch on less than zero
		pattern: '0000 01ss sss0 0000 iiii iiii iiii iiii',
		format: 'bltz {s}, {i<<2}',
		cycles: 1,
	},
	'bltzal': {	// branch on less than zero likely
		pattern: '0000 01ss sss1 0000 iiii iiii iiii iiii',
		format: 'bltzal {s}, {i<<2}',
		cycles: 1,
	},
	'bne': {	// branch on not equal
		pattern: '0001 01ss ssst tttt iiii iiii iiii iiii',
		format: 'bne {s}, {t}, {i<<2}',
		cycles: 1,
	},
	'break': {	// breakpoint
		pattern: '0000 00ii iiii iiii iiii iiii ii00 1101',
		format: 'break {i}',
		cycles: 1,
	},
	'cc': {		// color color
		pattern: '0100 1001 0011 1000 0000 0100 0001 1100',
		format: 'cc',
		cycles: 1,
	},
	'cdp': {	// color depth cue
		pattern: '0100 1001 0010 1000 0000 0100 0001 0100',
		format: 'cdp',
		cycles: 1,
	},
	'cfc0': {	// copy from COP0
		pattern: '0100 0000 010t tttt ssss s000 0000 0000',
		format: 'cfc0 {t}, {s}',
		cycles: 1,
	},
	'cfc2': {	// copy from COP2
		pattern: '0100 1000 110t tttt ssss s000 0000 0000',
		format: 'ctc2 {t}, {s}',
		cycles: 1,
	},
	'ctc0': {	// copy to COP0
		pattern: '0100 0000 110t tttt ssss s000 0000 0000',
		format: 'ctc0 {t}, {s}',
		cycles: 1,
	},
	'ctc2': {	// copy to COP2
		pattern: '0100 1000 110t tttt ssss s000 0000 0000',
		format: 'ctc2 {t}, {s}',
		cycles: 1,
	},
	'dpcl': {	// depth cue color light
		pattern: '0100 1000 0110 1000 0000 0000 0010 1001',
		format: 'dpcl'
	},
	'div': {	// divide word
		pattern: '0000 00ss ssst tttt 0000 0000 0001 1010',
		format: 'div {s}, {t}',
		cycles: 1,
	},
	'divu': {	// divide unsigned word
		pattern: '0000 00ss ssst tttt 0000 0000 0001 1011',
		format: 'divu {s}, {t}',
		cycles: 1,
	},
	'dpcs': {	// depth cueing
		pattern: '0100 1000 0111 1000 0000 0000 0001 0000',
		format: 'dpcs'
	},
	'dpct': {	// depth cue color RGB0-RGB3
		pattern: '0100 1000 1111 1000 0000 0000 0010 1010',
		format: 'dpct'
	},
	'gpf': {	// general purpose interpolation
		pattern: '0100 1001 1001 0000 0000 0000 0011 1101',
		format: 'gpf'
	},
	'gpl': {	// general purpose interpolation
		pattern: '0100 1001 1010 0000 0000 0000 0011 1110',
		format: 'gpl'
	},
	'intpl': {	// interpolation of vector and far color
		pattern: '0100 1000 1001 1000 0000 0000 0001 0001',
		format: 'intpl'
	},
	'j': {	// jump
		pattern: '0000 10ii iiii iiii iiii iiii iiii iiii',
		format: 'j {i<<2}',
		cycles: 1,
	},
	'jal': {	// jump and link
		pattern: '0000 11ii iiii iiii iiii iiii iiii iiii',
		format: 'jal {i<<2}',
		cycles: 1,
	},
	'jalr': {	// jump and link register
		pattern: '0000 00ss sss0 0000 dddd d000 0000 1001',
		format: 'jalr {s}, {d}',
		cycles: 1,
	},
	'jr': {	// jump register
		pattern: '0000 00ss sss0 0000 0000 0000 0000 1000',
		format: 'jr {s}',
		cycles: 1,
	},
	'lb': {	// load byte
		pattern: '1000 00ss ssst tttt iiii iiii iiii iiii',
		format: 'lb {t}, {s}+{i}',
		cycles: 1,
	},
	'lbu': {	// load byte unsigned
		pattern: '1001 00ss ssst tttt iiii iiii iiii iiii',
		format: 'lbu {t}, {s}+{i}',
		cycles: 1,
	},
	'lh': {	// load halfword
		pattern: '1000 01ss ssst tttt iiii iiii iiii iiii',
		format: 'lh {t}, {s}+{i}',
		cycles: 1,
	},
	'lhu': {	// load halfword unsigned
		pattern: '1001 01ss ssst tttt iiii iiii iiii iiii',
		format: 'lhu {t}, {s}+{i}',
		cycles: 1,
	},
	'lui': {	// load upper immediate
		pattern: '0011 1100 000t tttt iiii iiii iiii iiii',
		format: 'lui {t}, {i}',
		cycles: 1,
	},
	'lw': {	// load word
		pattern: '1000 11ss ssst tttt iiii iiii iiii iiii',
		format: 'lw {t}, {s}+{i}',
		cycles: 1,
	},
	'lwc2': {	// load word to cop2
		pattern: '0100 01ss ssst tttt iiii iiii iiii iiii',
		format: 'lwc1 {t}, {s}+{i}',
		cycles: 1,
	},
	'lwl': {	// load word left
		pattern: '1000 10ss ssst tttt iiii iiii iiii iiii',
		format: 'lwl {t}, {s}, {i}',
		cycles: 1,
	},
	'lwr': {	// load word right
		pattern: '1001 10ss ssst tttt iiii iiii iiii iiii',
		format: 'lwr {t}, {s}, {i}',
		cycles: 1,
	},
	'mfc0': {	// move word from cp0
		pattern: '0100 0000 000t tttt llll l000 0000 0000',
		format: 'mfc0 {t}, {l}',
		cycles: 1,
	},
	'mfc2': {	// move word from cop2
		pattern: '0100 0100 000t tttt ssss s000 0000 0000',
		format: 'mfc1 {t}, {s}',
		cycles: 1,
	},
	'mfhi': {	// move from hi register
		pattern: '0000 0000 0000 0000 dddd d000 0001 0000',
		format: 'mfhi {d}',
		cycles: 1,
	},
	'mflo': {	// move from lo register
		pattern: '0000 0000 0000 0000 dddd d000 0001 0010',
		format: 'mflo {d}',
		cycles: 1,
	},
	'mtc0': {	// move word to cp0
		pattern: '0100 0000 100t tttt llll l000 0000 0000',
		format: 'mtc0 {t}, {l}',
		cycles: 1,
	},
	'mtc2': {	// move word to floating-point
		pattern: '0100 0100 100t tttt ssss s000 0000 0000',
		format: 'mtc1 {t}, {s}',
		cycles: 1,
	},
	'mthi': {	// move to hi register
		pattern: '0000 00ss sss0 0000 0000 0000 0001 0001',
		format: 'mthi {s}',
		cycles: 1,
	},
	'mtlo': {	// move to lo register
		pattern: '0000 00ss sss0 0000 0000 0000 0001 0011',
		format: 'mtlo {s}',
		cycles: 1,
	},
	'mult': {	// multiply word
		pattern: '0000 00ss ssst tttt 0000 0000 0001 1000',
		format: 'mult {t}, {s}',
		cycles: 1,
	},
	'multu': {	// multiply unsigned word
		pattern: '0000 00ss ssst tttt 0000 0000 0001 1001',
		format: 'multu {t}, {s}',
		cycles: 1,
	},
	'mvmva': {	// multiply vector by matrix then vector addition
		pattern: '0100 1000 0100 0000 0000 0000 0001 0010',
		format: 'mvmva'
	},
	'nccs': {
		pattern: '0100 1001 0001 1000 0000 0100 0011 1111',
		format: 'nccs'
	},
	'ncct': {
		pattern: '0100 1001 0010 1000 0000 0100 0001 0100',
		format: 'ncct'
	},
	'ncds': {
		pattern: '0100 1000 1110 1000 0000 0100 0001 0011',
		format: 'ncds'
	},
	'ncdt': {
		pattern: '0100 1000 1111 1000 0000 0100 0001 0110',
		format: 'ncdt'
	},
	'nclip': {
		pattern: '0100 1001 0100 0000 0000 0000 0000 0110',
		format: 'nclip'
	},
	'ncs': {
		pattern: '0100 1000 1100 1000 0000 0100 0001 1110',
		format: 'ncs'
	},
	'nct': {
		pattern: '0100 1000 1101 1000 0000 0100 0010 0000',
		format: 'nct'
	},
	'nor': {	// not or
		pattern: '0000 00ss ssst tttt dddd d000 0010 0111',
		format: 'nor {d}, {s}, {t}',
		cycles: 1,
	},
	'or': {		// or
		pattern: '0000 00ss ssst tttt dddd d000 0010 0101',
		format: 'or {d}, {s}, {t}',
		cycles: 1,
	},
	'ori': {	// or immediate
		pattern: '0011 01ss ssst tttt iiii iiii iiii iiii',
		format: 'ori {t}, {s}, {i}',
		cycles: 1,
	},
	'rfe': {	// return from exception
		pattern: '0100 0010 0000 0000 0000 0000 0001 0000',
		format: 'rfe',
		cycles: 1,
	},
	'rtps': {
		pattern: '0100 1000 0100 0000 0000 0000 0001 0010',
		format: 'rtps'
	},
	'rtpt': {
		pattern: '0100 1000 0010 1000 0000 0000 0011 0000',
		format: 'rtpt'
	},
	'sb': {	// store byte
		pattern: '1010 00ss ssst tttt iiii iiii iiii iiii',
		format: 'sb {t}, {s}+{i}',
		cycles: 1,
	},
	'sh': {	// store halfword
		pattern: '1010 01ss ssst tttt iiii iiii iiii iiii',
		format: 'sh {t}, {s}+{i}',
		cycles: 1,
	},
	'sll': {	// shift word left logical
		pattern: '0000 0000 000t tttt dddd diii ii00 0000',
		format: 'sll {d}, {t}, {i}',
		cycles: 1,
	},
	'sllv': {	// shift word left logical variable
		pattern: '0000 00ss ssst tttt dddd d000 0000 0100',
		format: 'sllv {d}, {t}, {s}',
		cycles: 1,
	},
	'slt': {	// set on less than
		pattern: '0000 00ss ssst tttt dddd d000 0010 1010',
		format: 'slt {d}, {s}, {t}',
		cycles: 1,
	},
	'slti': {	// set on less than immediate
		pattern: '0010 10ss ssst tttt iiii iiii iiii iiii',
		format: 'slti {t}, {s}, {i}',
		cycles: 1,
	},
	'sltiu': {	// set on less than immediate unsigned
		pattern: '0010 11ss ssst tttt iiii iiii iiii iiii',
		format: 'sltiu {t}, {s}, {i}',
		cycles: 1,
	},
	'sltu': {	// set on less than unsigned
		pattern: '0000 00ss ssst tttt dddd d000 0010 1011',
		format: 'sltu {d}, {s}, {t}',
		cycles: 1,
	},
	'sqr': {
		pattern: '0100 1000 1010 0000 0000 0100 0010 1000',
		format: 'sqr'
	},
	'sra': {	// shift word right arithmetic
		pattern: '0000 0000 000t tttt dddd diii ii00 0011',
		format: 'sra {d}, {t}, {i}',
		cycles: 1,
	},
	'srav': {	// shift word right arithmetic variable
		pattern: '0000 00ss ssst tttt dddd d000 0000 0111',
		format: 'srav {d}, {t}, {s}',
		cycles: 1,
	},
	'srl': {	// shift word right logical
		pattern: '0000 0000 000t tttt dddd diii ii00 0010',
		format: 'srl {d}, {t}, {i}',
		cycles: 1,
	},
	'srlv': {	// shift word right logical variable
		pattern: '0000 00ss ssst tttt dddd d000 0000 0110',
		format: 'srlv {d}, {t}, {s}',
		cycles: 1,
	},
	'sub': {	// subtract word
		pattern: '0000 00ss ssst tttt dddd d000 0010 0010',
		format: 'sub {d}, {s}, {t}',
		cycles: 1,
	},
	'subu': {	// subtract unsigned word
		pattern: '0000 00ss ssst tttt dddd d000 0010 0011',
		format: 'subu {d}, {s}, {t}',
		cycles: 1,
	},
	'sw': {	// store word
		pattern: '1010 11ss ssst tttt iiii iiii iiii iiii',
		format: 'sw {t}, {s}+{i}',
		cycles: 1,
	},
	'swc2': {	// store word from COP2
		pattern: '1110 01ss ssst tttt iiii iiii iiii iiii',
		format: 'swc1 {t}, {s}+{i}',
		cycles: 1,
	},
	'swl': {	// store word left
		pattern: '1010 10ss ssst tttt iiii iiii iiii iiii',
		format: 'swl {t}, {s}+{i}',
		cycles: 1,
	},
	'swr': {	// store word right
		pattern: '1011 10ss ssst tttt iiii iiii iiii iiii',
		format: 'swr {t}, {s}+{i}',
		cycles: 1,
	},
	'syscall': {	// system call
		pattern: '0000 00ii iiii iiii iiii iiii ii00 1100',
		format: 'syscall {i}',
		cycles: 1,
	},
	'xor': {	// exclusive or
		pattern: '0000 00ss ssst tttt dddd d000 0010 0110',
		format: 'xor {d}, {s}, {t}',
		cycles: 1,
	},
	'xori': {	// exclusive or immediate
		pattern: '0011 10ss ssst tttt iiii iiii iiii iiii',
		format: 'xori {t}, {s}, {i}',
		cycles: 1,
	},
};

Disassembler.patterns = [];

(function() {
	function tryParse(opcode)
	{
		var xored = opcode ^ this.xorMask;
		if ((xored & this.andMask) != 0)
			return null;
		
		var values = [];
		for (var key in this.variables)
		{
			var vMask = this.variables[key][0];
			var vShift = this.variables[key][1];
			var value = (opcode & vMask) >>> vShift;
			values.push(value);
		}
		
		return values;
	}
	
	// takes the string binary patterns and turn them into a form we can easily
	// match
	for (var instruction in Disassembler.patternData)
	{
		var patternData = Disassembler.patternData[instruction];
		var pattern = patternData.pattern;
		var bitMask = 0;
		var xorMask = 0;
		var variables = {};
		for (var i = 0; i < pattern.length; i++)
		{
			var bit = pattern.charAt(i);
			if (bit == ' ') continue;
			
			bitMask <<= 1;
			bitMask |= isFinite(bit);
			xorMask <<= 1;
			xorMask |= bit == 1;
			
			for (var variable in variables)
				variables[variable][0] <<= 1;
			
			if (bit >= 'a' && bit <= 'z')
			{
				if (!(bit in variables))
					variables[bit] = [0, 0];
				variables[bit][0] |= 1;
				variables[bit][1]--;
			}
			
			for (var variable in variables)
				variables[variable][1]++;
		}
		
		Disassembler.patterns.push({
			name: instruction,
			cycles: patternData.cycles,
			andMask: bitMask,
			xorMask: xorMask,
			variables: variables,
			tryParse: tryParse
		});
	}
})();