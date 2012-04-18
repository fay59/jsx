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

var bios = new GeneralPurposeBuffer(0x80000);
var hardwareRegisters = new HardwareRegisters();
var parallelPort = new ParallelPortMemoryRange();

function testCPU()
{
	var cpu = new R3000a();
	var memory = new MemoryMap(hardwareRegisters, parallelPort, bios);
	cpu.hardwareReset();
	cpu.softwareReset(memory);
	
	for (var i = 0; i < cpu.gpr.length; i++)
		cpu.gpr[i] = i;
	return cpu;
}

function writeInstructions(memory, instructions)
{
	const startAddress = 0x500;
	instructions.push("jr ra");
	var compiled = Assembler.assemble(instructions);
	for (var i = 0; i < compiled.length; i++)
		memory.write32(startAddress + i * 4, compiled[i]);
	return startAddress;
}

function perform(opcodes)
{
	var cpu = testCPU();
	var address = writeInstructions(cpu.memory, opcodes);
	cpu.execute(address);
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
	
	"Instructions": {
		"add": function(r)
		{
			var cpu = perform(["add v0, r0, v1"]);
			with (Assembler.registerNames)
				r.assert(cpu.gpr[v0] == cpu.gpr[v1], "execution didn't have the expected result");
			r.complete();
			// TODO test for overflows
		},
		
		"addi with positive immediate": function(r)
		{
			var cpu = perform(["addi v0, r0, 1111"]);
			with (Assembler.registerNames)
				r.assert(cpu.gpr[v0] == 0x1111, "execution didn't have the expected result");
			r.complete();
			// TODO test for overflows
		},
		
		"addi with negative immediate": function(r)
		{
			var cpu = perform(["addi v0, r0, -1111"]);
			with (Assembler.registerNames)
				r.assert((cpu.gpr[v0] | 0) == -0x1111, "execution didn't have the expected result");
			r.complete();
			// TODO test for overflows
		},
		
		"addiu with positive immediate": function(r)
		{
			var cpu = perform(["addiu v0, r0, 1111"]);
			with (Assembler.registerNames)
				r.assert(cpu.gpr[v0] == 0x1111, "execution didn't have the expected result");
			r.complete();
		},
		
		"addiu with negative immediate": function(r)
		{
			var cpu = perform(["addiu v0, r0, -1111"]);
			with (Assembler.registerNames)
				r.assert((cpu.gpr[v0] | 0) == -0x1111, "execution didn't have the expected result");
			r.complete();
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
				r.assert(cpu.gpr[v0] == (t7 & t8), "execution didn't have the expected result");
			r.complete();
		},
		
		"andi with positive immediate": function(r)
		{
			var cpu = perform(["andi v0, t8, 148c"]);
			with (Assembler.registerNames)
				r.assert(cpu.gpr[v0] == (t8 & 0x148c), "execution didn't have the expected result");
			r.complete();
		},
		
		"andi with negative immediate": function(r)
		{
			var cpu = perform(["andi v0, t8, -148c"]);
			with (Assembler.registerNames)
				r.assert(cpu.gpr[v0] == (t8 & -0x148c), "execution didn't have the expected result");
			r.complete();
		},
		
		"lui, ori, sw, lb": function(r)
		{
			var cpu = perform([
				"lui at, dead",
				"ori at, at, beef",
				"sw at, r0+0",
				"lb t0, r0+0"]);
			
			with (Assembler.registerNames)
			{
				r.assert(cpu.gpr[at] == 0xdeadbeef, "lui/ori pair didn't load the correct value");
				r.assert(cpu.memory.read32(0) == 0xdeadbeef, "sw didn't write the correct value");
				r.assert(cpu.gpr[t0] == 0xef, "lb didn't load the correct value");
			}
			r.complete()
		},
		
		"sra": function(r)
		{
			var cpu = perform(["sra at, t7, 4"]);
			with (Assembler.registerNames)
				r.assert(cpu.gpr[at] == (t7 >> 4), "execution didn't have the expected result");
			r.complete();
		}
	}
};

document.addEventListener('DOMContentLoaded', function()
{
	for (var key in Tests)
	{
		var div = document.createElement('div');
		var title = document.createElement('h2');
		var list = document.createElement('ul');
		
		title.textContent = key;
		div.className = 'test-cat';
		
		div.appendChild(title);
		div.appendChild(list);
		document.body.appendChild(div);
		
		var tests = Tests[key];
		for (var testName in tests)
		{
			var result = document.createElement('li');
			result.textContent = testName;
			result.appendChild(document.createElement('br'));
			list.appendChild(result);
			
			var message = document.createElement('span');
			result.appendChild(message);
			
			var result = new TestResult(message);
			try
			{
				tests[testName](result);
			}
			catch (e)
			{
				result.fail(e.toString());
			}
		}
	}
});