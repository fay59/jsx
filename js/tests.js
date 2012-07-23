function assert(cond, message, result)
{
	if (!cond)
	{
		if (result !== undefined)
			result.fail(message);
		
		throw new Error(message);
	}
}

function expect(message, func)
{
	return function(r)
	{
		try
		{
			func(r);
			r.fail("error '" + message + "' did not trigger");
		}
		catch (e)
		{
			assert(e.message == message, "expected message '" + message + "', got '" + e.message + "'", r);
		}
	}
}

function closureExpect(message, r, func)
{
	return function()
	{
		try
		{
			func();
			r.fail("error '" + message + "' did not trigger");
		}
		catch (e)
		{
			assert(e.message == message, "expected message '" + message + "', got '" + e.message + "'", r);
		}
		r.complete();
	}
}

function catchFail(r, func)
{
	return function()
	{
		try
		{
			func();
			r.complete();
		}
		catch (e)
		{
			r.fail(e.message);
		}
	}
}

var TestResult = function(element)
{
	element.textContent = '...';
	var finished = false;
	
	this.assert = function(condition, message)
	{
		if (!condition)
			this.fail(message);
	}
	
	this.complete = function()
	{
		if (finished) return;
		element.className = 'success';
		element.textContent = 'success';
		finished = true;
	}
	
	this.fail = function(message)
	{
		if (finished) return;
		element.className = 'error';
		element.textContent = message;
		finished = true;
	}
}

var psx = new PSX(console, null, new ArrayBuffer(0x80000), [], []);

function initialValue(register)
{
	return (register * 17) + (register * 1339);
}

function testCPU()
{
	psx.reset();
	var cpu = psx.cpu;
	
	for (var i = 0; i < cpu.gpr.length; i++)
		cpu.gpr[i] = initialValue(i);
	
	for (var i = 0; i < cpu.cop0_reg.length; i++)
		cpu.cop0_reg[i] = 32 + i;
	return cpu;
}

function writeInstructions(memory, instructions)
{
	const startAddress = 0x500;
	instructions.push("jr ra");
	instructions.push("sll 0, 0, 0");
	var compiled = Assembler.assemble(instructions);
	for (var i = 0; i < compiled.length; i++)
		memory.write32(startAddress + i * 4, compiled[i]);
	return startAddress;
}

function perform(opcodes)
{
	var cpu = testCPU();
	var address = writeInstructions(cpu.memory, opcodes);
	cpu.executeBlock(address);
	return cpu;
}

var Tests = {
	"Memory Map": {
		"Parallel port addresses are contiguous": function(r)
		{
			function verify(a)
			{
				for (var i = 0; i < a.length; i++)
				{
					if (!isFinite(a[i]))
					{
						r.fail("non-contiguity at index " + i);
						return;
					}
				}
			}
			
			var parallel = new ParallelPortMemoryRange();
			verify(parallel.u8);
			verify(parallel.u16);
			verify(parallel.u32);
			r.complete();
		},
		
		"Hardware registers are contiguous": function(r)
		{
			function verify(a, name)
			{
				for (var i = 0; i < a.length; i++)
				{
					if (!isFinite(a[i]))
					{
						r.fail(name + " is non-contiguous at index " + i);
						return;
					}
				}
			}
			
			var hardware = psx.hardwareRegisters;
			verify(hardware.u8, "u8");
			verify(hardware.u16, "u16");
			verify(hardware.u32, "u32");
			r.complete();
		}
	},
	
	"Assembler": {
		"Assemble an add": function(r)
		{
			var opcode = "add v0, r0, v1";
			var binary = Assembler.assembleOne(opcode);
			var expectedResult = 0x00031020;
			r.assert(binary == expectedResult, opcode + ' did not compile as expected');
			r.complete();
		},
		
		"Assemble an addi": function(r)
		{
			var opcode = "addi v0, r0, -1111";
			var binary = Assembler.assembleOne(opcode);
			var expectedResult = 0x2002eeef;
			r.assert(binary == expectedResult, opcode + ' did not compile as expected');
			r.complete();
		},
		
		"Assemble two adds": function(r)
		{
			var opcodes = [
				"add v0, r0, v1",
				"add v0, r0, v1"
			];
			var binary = Assembler.assemble(opcodes);
			var expectedResult = 0x00031020;
			
			r.assert(binary.length == opcodes.length, "opcodes were lost or added");
			for (var i = 0; i < binary.length; i++)
				r.assert(binary[i] == expectedResult, opcodes[i] + " did not compile as expected");
			r.complete();
		}
	},
	
	"System Behavior": {
		"Cache Isolation": function(r)
		{
			var cpu = perform([
				"lui at, " + (R3000a.srFlags.IsC >>> 16).toString(16),
				"mtc0 at, SR",
				"sw t0, r0+0",
				"mtc0 r0, SR",
				"lw t0, r0+0"]);
			
			with (Assembler.registerNames)
				r.assert(cpu.gpr[t0] == 0, "cache isolation is not doing its job");
			r.complete();
		}
	},
	
	"Instructions": {
		"add": function(r)
		{
			var cpu = perform(["add v0, r0, v1"]);
			with (Assembler.registerNames)
				r.assert(cpu.gpr[v0] == cpu.gpr[v1], "execution didn't have the expected result");
			r.complete();
			// TODO test for overflows
		},
		
		"addi": {
			"positive immediate": function(r)
			{
				var cpu = perform(["addi v0, r0, 1111"]);
				with (Assembler.registerNames)
					r.assert(cpu.gpr[v0] == 0x1111, "execution didn't have the expected result");
				r.complete();
				// TODO test for overflows
			},
			
			"negative immediate": function(r)
			{
				var cpu = perform(["addi v0, r0, -1111"]);
				with (Assembler.registerNames)
					r.assert((cpu.gpr[v0] | 0) == -0x1111, "execution didn't have the expected result");
				r.complete();
				// TODO test for overflows
			}
		},
		
		"addiu": {
			"positive immediate": function(r)
			{
				var cpu = perform(["addiu v0, r0, 1111"]);
				with (Assembler.registerNames)
					r.assert(cpu.gpr[v0] == 0x1111, "execution didn't have the expected result");
				r.complete();
			},
			
			"negative immediate": function(r)
			{
				var cpu = perform(["addiu v0, r0, -1111"]);
				with (Assembler.registerNames)
					r.assert((cpu.gpr[v0] | 0) == -0x1111, "execution didn't have the expected result");
				r.complete();
			}
		},
		
		"addu": function(r)
		{
			var cpu = perform(["addu v0, r0, v1"]);
			with (Assembler.registerNames)
				r.assert(cpu.gpr[v0] == cpu.gpr[v1], "execution didn't have the expected result");
			r.complete();
		},
		
		"and": function(r)
		{
			var cpu = perform(["and v0, t7, t8"]);
			with (Assembler.registerNames)
				r.assert(cpu.gpr[v0] == (initialValue(t7) & initialValue(t8)), "execution didn't have the expected result");
			r.complete();
		},
		
		"andi": {
			"positive immediate": function(r)
			{
				var cpu = perform(["andi v0, t8, 148c"]);
				with (Assembler.registerNames)
					r.assert(cpu.gpr[v0] == (initialValue(t8) & 0x148c), "execution didn't have the expected result");
				r.complete();
			},
			
			"negative immediate": function(r)
			{
				var cpu = perform(["andi v0, t8, -148c"]);
				with (Assembler.registerNames)
					r.assert(cpu.gpr[v0] == (initialValue(t8) & -0x148c), "execution didn't have the expected result");
				r.complete();
			}
		},
		
		"Branching": function(r)
		{
			var cpu = perform([
				"or at, r0, 0",
				"ori t0, r0, 40", // 0x40 == 64
				"addiu t0, t0, ffff",
				"bne t0, r0, 3fff8", // -2 instructions
				"addiu at, at, ffff"]);
			
			with (Assembler.registerNames)
			{
				r.assert(cpu.gpr[t0] == 0, "loop didn't bring t0 to 0");
				r.assert((cpu.gpr[at] | 0) == -64, "delay slot didn't execute correctly");
			}
			r.complete();
		},
		
		"div": function(r)
		{
			var cpu = perform(["div t8, v0"]);
			with (Assembler.registerNames)
			{
				r.assert(cpu.gpr[32] == t8 % v0, "execution didn't have the expected result");
				r.assert(cpu.gpr[33] == Math.floor(t8 / v0), "execution didn't have the expected result");
			}
			r.complete();
		},
		
		"divu": function(r)
		{
			var bigger = 0xffeff891;
			var smaller = 0x11224455;
			var cpu = perform([
				"lui t0, ffef",
				"ori t0, t0, f891",
				"lui t1, 1122",
				"ori t1, t1, 4455",
				"divu t0, t1"]);
			
			with (Assembler.registerNames)
			{
				r.assert(cpu.gpr[32] == bigger % smaller, "execution didn't have the expected result");
				r.assert(cpu.gpr[33] == Math.floor(bigger / smaller), "execution didn't have the expected result");
			}
			r.complete();
		},
		
		"lb/lbu": {
			"lui, ori, sw, lbu (with unsigned value)": function(r)
			{
				var cpu = perform([
					"lui at, dead",
					"ori at, at, beef",
					"sw at, r0+0",
					"lbu t0, r0+0"]);
				
				with (Assembler.registerNames)
				{
					r.assert(cpu.gpr[at] == 0xdeadbeef, "lui/ori pair didn't load the correct value");
					r.assert(cpu.memory.read32(0) == 0xdeadbeef, "sw didn't write the correct value");
					r.assert(cpu.gpr[t0] == 0xef, "lbu didn't load the correct value");
				}
				r.complete()
			},
			
			"ori, sw, lb (with signed value)": function(r)
			{
				var cpu = perform([
					"ori at, r0, ff",
					"sw at, r0+0",
					"lb t0, r0+0"]);
				
				with (Assembler.registerNames)
				{
					r.assert(cpu.gpr[at] == 0xff, "ori operation didn't load the correct value");
					r.assert(cpu.memory.read32(0) == 0xff, "sw didn't write the correct value");
					r.assert(cpu.gpr[t0] == 0xffffffff, "lb didn't load the correct value");
				}
				r.complete()
			}
		},
		
		"lh": function(r)
		{
				var cpu = perform([
					"lui at, dead",
					"ori at, at, beef",
					"sw at, r0+0",
					"lh t0, r0+0"]);
				
				with (Assembler.registerNames)
				{
					r.assert(cpu.gpr[at] == 0xdeadbeef, "lui/ori pair didn't load the correct value");
					r.assert(cpu.memory.read32(0) == 0xdeadbeef, "sw didn't write the correct value");
					r.assert(cpu.gpr[t0] == 0xffffbeef, "lh didn't load the correct value");
				}
				r.complete()
		},
		
		"sb": function(r)
		{
			var cpu = perform([
				"ori at, r0, 0xff",
				"sb at, r0+0"]);
			
			with (Assembler.registerNames)
			{
				r.assert(cpu.gpr[at] == 0xff, "ori operation didn't load the correct value");
				r.assert(cpu.memory.read8(0) == 0xff, "sb didn't write the correct value");
			}
			r.complete()
		},
		
		"sh": function(r)
		{
			var cpu = perform([
				"ori at, r0, 0xffff",
				"sh at, r0+0"]);
			
			with (Assembler.registerNames)
			{
				r.assert(cpu.gpr[at] == 0xffff, "ori operation didn't load the correct value");
				r.assert(cpu.memory.read16(0) == 0xffff, "sh didn't write the correct value");
			}
			r.complete()
		},
		
		"sra": function(r)
		{
			var cpu = perform(["sra at, t7, 4"]);
			with (Assembler.registerNames)
				r.assert(cpu.gpr[at] == (initialValue(t7) >> 4), "execution didn't have the expected result");
			r.complete();
		},
		
		"srl": function(r)
		{
			var cpu = perform(["srl at, t7, 4"]);
			with (Assembler.registerNames)
				r.assert(cpu.gpr[at] == (initialValue(t7) >>> 4), "execution didn't have the expected result");
			r.complete();
		},
		
		"srav": function(r)
		{
			const shift = 3;
			var cpu = perform([
				"addiu t0, r0, " + shift,
				"srav at, t7, t0"
			]);
			with (Assembler.registerNames)
				r.assert(cpu.gpr[at] == (initialValue(t7) >> shift), "execution didn't have the expected result");
			r.complete();
		},
		
		"srlv": function(r)
		{
			const shift = 3;
			var cpu = perform([
				"addiu t0, r0, " + shift,
				"srlv at, t7, t0"
			]);
			with (Assembler.registerNames)
				r.assert(cpu.gpr[at] == (initialValue(t7) >>> shift), "execution didn't have the expected result");
			r.complete();
		},
		
		"sllv": function(r)
		{
			const shift = 3;
			var cpu = perform([
				"addiu t0, r0, " + shift,
				"sllv at, t7, t0"
			]);
			with (Assembler.registerNames)
				r.assert(cpu.gpr[at] == (initialValue(t7) << shift), "execution didn't have the expected result");
			r.complete();
		},
		
		"subu": {
			"positive result": function(r)
			{
				var cpu = perform(["subu at, t7, t0"]);
				with (Assembler.registerNames)
					r.assert(cpu.gpr[at] == (initialValue(t7) - initialValue(t0)), "execution didn't have the expected result");
				r.complete();
			},
			
			"negative result": function(r)
			{
				var cpu = perform(["subu at, t0, t7"]);
				with (Assembler.registerNames)
					r.assert((cpu.gpr[at] | 0) == (initialValue(t0) - initialValue(t7)), "execution didn't have the expected result");
				r.complete();
			}
		},
		
		"slt": function(r)
		{
			var cpu = perform([
				"lui t0, ffff",
				"lui t1, 7fff",
				"slt at, t0, t1"]);
			with (Assembler.registerNames)
				r.assert(cpu.gpr[at] == 1, "execution didn't have the expected result");
			r.complete();
		},
		
		"sltu": {
			"false result": function(r)
			{
				var cpu = perform([
					"ori t0, r0, 4000",
					"ori t1, r0, 5000",
					"sltu at, t0, t1"]);
				with (Assembler.registerNames)
					r.assert(cpu.gpr[at] == 1, "execution didn't have the expected result");
				r.complete();
			},
			
			"true result": function(r)
			{
				var cpu = perform([
					"ori t0, r0, 5000",
					"ori t1, r0, 4000",
					"sltu at, t0, t1"]);
				with (Assembler.registerNames)
					r.assert(cpu.gpr[at] == 0, "execution didn't have the expected result");
				r.complete();
			}
		},
		
		"sltiu": function(r)
		{
			with (Assembler.registerNames)
			{
				var cpu = perform(["sltiu at, v0, " + initialValue(v1)]);
				r.assert(cpu.gpr[at] == (initialValue(v0) < initialValue(v1)), "execution didn't have the expected result");
			}
			r.complete();
		},
		
		"slti": {
			"positive immediate": function(r)
			{
				with (Assembler.registerNames)
				{
					var cpu = perform(["slti at, v0, " + initialValue(v1)]);
					r.assert(cpu.gpr[at] == (initialValue(v0) < initialValue(v1)), "execution didn't have the expected result");
				}
				r.complete();
			},
			
			"negative immediate": function(r)
			{
				with (Assembler.registerNames)
				{
					var cpu = perform(["slti at, v0, ffff"]);
					r.assert(cpu.gpr[at] == (initialValue(v0) < (0xffffffff | 0)), "execution didn't have the expected result");
				}
				r.complete();
			}
		},
		
		"or": function(r)
		{
			var cpu = perform(["or at, t6, t8"]);
			with (Assembler.registerNames)
				r.assert(cpu.gpr[at] == (initialValue(t6) | initialValue(t8)), "execution didn't have the expected result");
			r.complete();
		},
		
		"mfc0": function(r)
		{
			var cpu = perform(["mfc0 v0, SR"]);
			
			with (Assembler.registerNames)
			with (Assembler.cop0RegisterNames)
				r.assert(cpu.gpr[v0] == cpu.cop0_reg[SR], "execution didn't have the expected result");
			r.complete();
		},
		
		"mtc0": function(r)
		{
			var cpu = perform(["mtc0 v0, SR"]);
			
			with (Assembler.registerNames)
			with (Assembler.cop0RegisterNames)
				r.assert(cpu.gpr[v0] == cpu.cop0_reg[SR], "execution didn't have the expected result");
			r.complete();
		},
		
		"mfhi": function(r)
		{
			var cpu = perform([
				"div t8, k0",
				"mfhi at"]);
			
			with (Assembler.registerNames)
				r.assert(cpu.gpr[at] == initialValue(t8) % initialValue(k0), "execution didn't have the expected result");
			r.complete();
		},
		
		"mflo": function(r)
		{
			var cpu = perform([
				"div t8, k0",
				"mflo at"]);
			
			with (Assembler.registerNames)
				r.assert(cpu.gpr[at] == Math.floor(initialValue(t8) / initialValue(k0)), "execution didn't have the expected result");
			r.complete();
		},
		
		"All instructions implemented": function(r)
		{
			var missingInstructions = [];
			var instructionCount = 0;
			var recompiler = new Recompiler.Context(new MemoryCache({compiled: null}), false);
			for (var instruction in Disassembler.patternData)
			{
				var jsCode = recompiler[instruction].call(recompiler, 1, 1, 1);
				if (jsCode !== undefined && jsCode.indexOf("is not implemented") != -1)
					missingInstructions.push(instruction);
				
				instructionCount++;
			}
			
			if (missingInstructions.length == 0)
				r.complete();
			else if (missingInstructions.length == 1)
				r.fail(missingInstructions + " is missing");
			else
				r.fail(missingInstructions.join(", ") + " are missing");
		}
	},
	
	"Runtime functions": {
		"multu": function(r)
		{
			var number = 33554432;
			var gpr = new Uint32Array(34);
			R3000a.runtime.multu(gpr, number, number);
			r.assert(gpr[33] == 0, "multiplication should leave lo = 0");
			r.assert(gpr[32] == (1 << 18), "multiplication should leave hi = 2^20");
			r.complete();
		}
	}
};

function runTestSuite(name, suite, parentElement, depth)
{
	var li = document.createElement('li');
	if (suite.call !== undefined)
	{
		li.textContent = name + ": ";
		var message = document.createElement('span');
		message.textContent = "...";
		li.appendChild(message);
		
		setTimeout(function() {
			var result = new TestResult(message);
			try { suite(result); }
			catch (e) { result.fail(e.toString()); }
		}, 0);
	}
	else
	{
		var h = document.createElement('h' + depth);
		h.textContent = name;
		li.appendChild(h);
		
		var ul = document.createElement('ul');
		for (var key in suite)
			runTestSuite(key, suite[key], ul, depth + 1);
		li.appendChild(ul);
	}
	parentElement.appendChild(li);
}

function runTests()
{
	var ul = document.createElement("ul");
	runTestSuite("JSX Test Suite", Tests, ul, 1);
	document.body.appendChild(ul);
}

document.addEventListener('DOMContentLoaded', runTests);