var psx = null;
var dbg = null;

var requiredScripts = [
	"js/core/disasm.js",
	"js/core/r3000a.js",
	"js/core/compiled.js",
	"js/core/hwregs.js",
	"js/core/parallel.js",
	"js/core/memory.js",
	"js/core/recompiler.js",
	"js/core/asm.js",
	"js/core/mdec.js",
	"js/core/gpu.js",
	"js/core/spu.js",
	"js/core/counters.js",
	"js/core/psx.js",
	"js/debugger/debugger.js",
	"js/debugger/disasm-table.js",
	"js/debugger/breakpoint.js",
	"js/debugger/breakpoint-table.js"];

function onload()
{
	const disassemblyLength = 25;
	var bios = null;
	
	var status = new StatusQueue(document.querySelector("#status"));
	var disasm = new DisassemblyTable(document.querySelector("#disasm"));
	var breakpointTable = new BreakpointTable(document.querySelector("#breakpoints"));
	var diags = {
		error: function(message)
		{
			console.error(message);
			status.display(message, 'red');
		},
		
		warn: function(message)
		{
			console.warn(message);
			status.display(message, 'orange');
		},
		
		debug: function(message)
		{
			console.debug(message);
		},
		
		log: function(message)
		{
			console.log(message);
			status.display(message);
		}
	};
	
	var resetButton = document.querySelector("#reset");
	var runButton = document.querySelector("#run");
	var stepOverButton = document.querySelector("#step-over");
	var stepIntoButton = document.querySelector("#step-into");
	var pauseButton = document.querySelector("#pause");
	var goToButton = document.querySelector("#goto");
	var disasmContainer = document.querySelector("#disasm-container");
	var addBreakpointButton = document.querySelector("#add-breakpoint");
	var stack = document.querySelector("#stack");
	var biosPicker = document.querySelector("#bios-picker");
	var regContainers = document.querySelectorAll(".regs");
	var registerLabels = document.querySelectorAll("#regs > legend span");
	var utilLabels = document.querySelectorAll("#utils > legend span");
	
	function reset()
	{
		psx = new PSX(diags, null, bios, [], []);
		dbg = new Debugger(psx);
		dbg.addEventListener(Debugger.STEPPED_EVENT, onStep);
		dbg.addEventListener(Debugger.STEPPED_INTO_EVENT, refreshStack);
		dbg.addEventListener(Debugger.STEPPED_OUT_EVENT, refreshStack);
		
		breakpointTable.reset(dbg.breakpoints);
		dbg.reset(R3000a.bootAddress);
	}
	
	function onStep()
	{
		for (var i = 0; i < regs.length; i++)
			regs[i].update();
		
		disasm.select(dbg.pc);
		var row = disasm.rows[dbg.pc];
		if (row == null)
		{
			if (psx.memory != null)
			{
				disasm.reset(psx.memory, dbg.pc - 8, dbg.pc + 0x80, dbg.pc, runPC, toggleBreakpoint);
				disasmContainer.scrollTop = 12;
			}
		}
		else if (row.offsetTop + row.offsetHeight < disasmContainer.scrollTop
			|| row.offsetTop > disasmContainer.scrollTop + disasmContainer.offsetHeight)
		{
			disasmContainer.scrollTop = row.offsetTop - 10;
		}
		
		pauseButton.disabled = true;
		stepOverButton.disabled = false;
		stepIntoButton.disabled = !dbg.canStepInto();
		
		var hexPC = Recompiler.formatHex(dbg.pc);
		if (stack.firstChild)
		{
			var frameNumber = stack.childNodes.length - 1;
			stack.firstChild.textContent = frameNumber + ": " + hexPC;
		}
		diags.log("BIOS » " + hexPC);
	}
	
	function refreshStack()
	{
		while (stack.childNodes.length)
			stack.removeChild(stack.firstChild);
		
		for (var i = 0; i < dbg.stack.length; i++)
		{
			var option = document.createElement('option');
			option.textContent = i + ": " + Recompiler.formatHex(dbg.stack[i]);
			stack.insertBefore(option, stack.firstChild);
		}
		
		var option = document.createElement('option');
		option.textContent = dbg.stack.length + ": " + Recompiler.formatHex(dbg.pc);
		stack.insertBefore(option, stack.firstChild);
	}
	
	function readBios(event)
	{
		var reader = new FileReader();
		reader.onload = function()
		{
			bios = reader.result;
			reset();
		}
		reader.readAsArrayBuffer(this.files[0]);
	}
	
	function goToPC(pc)
	{
		disasm.reset(psx.memory, pc - 8, pc + 0x80, pc, runPC, toggleBreakpoint);
	}
	
	function runPC(event)
	{
		var pc = parseInt(this.parentNode.childNodes[1].textContent, 16);
		if (event.altKey)
		{
			diags.log("setting PC to " + Recompiler.formatHex(pc));
			dbg.pc = pc;
			pauseButton.disabled = true;
			disasm.select(pc);
		}
		else if (pc > dbg.pc)
		{
			diags.log("running to " + Recompiler.formatHex(pc));
			dbg.runUntil(pc);
		}
	}
	
	function toggleBreakpoint()
	{
		var address = parseInt(this.textContent, 16);
		dbg.breakpoints.toggleBreakpoint(address);
	}
	
	function showDivByIndex(index)
	{
		return function()
		{
			var divs = this.parentNode.parentNode.querySelectorAll(".collapsable");
			for (var i = 0; i < divs.length; i++)
			{
				if (i == index)
					divs[i].style.display = "block";
				else
					divs[i].style.display = "none";
			}
		}
	}
	
	function makeTitle(i)
	{
		return function()
		{
			if (dbg != null)
				this.title = Recompiler.formatHex(dbg.lastRegWrites[i]);
		}
	}
	
	function regField(kind, byteSize, id, nameArray)
	{
		var label = document.createElement("label");
		label.textContent = id;
		if (nameArray != undefined)
			label.textContent += " / " + nameArray[id];
		
		var field = document.createElement("input");
		field.size = (byteSize * 2) + 1;
		field.type = "text";
		field.addEventListener("blur", function()
		{
			dbg["set" + kind](id, field.value);
			label.update();
		});
		
		label.update = function()
		{
			var newValue = dbg["get" + kind](id);
			if (field.value != newValue)
			{
				field.value = newValue;
				label.style.color = "red";
			}
			else
			{
				label.style.color = "inherit";
			}
		}
		label.appendChild(field);
		return label;
	}
	
	function run() { dbg.run(); }
	function stepOver() { dbg.stepOver(); }
	function stepInto() { dbg.stepInto(); }
	
	resetButton.addEventListener("click", reset);
	runButton.addEventListener("click", run);
	stepOverButton.addEventListener("click", stepOver);
	stepIntoButton.addEventListener("click", stepInto);
	
	pauseButton.style.display = 'none';
	
	var regs = [];
	for (var i = 0; i < 16; i++)
	{
		var gpr = regField("GPR", 4, i, Disassembler.registerNames);
		var cpr = regField("CPR", 4, i, Disassembler.cop0RegisterNames);
		regContainers[0].appendChild(gpr);
		regContainers[1].appendChild(cpr);
		regs.push(gpr, cpr);
		gpr.addEventListener("mouseover", makeTitle(i));
	}
	
	for (var i = 16; i < 32; i++)
	{
		var gpr = regField("GPR", 4, i, Disassembler.registerNames);
		regContainers[0].appendChild(gpr);
		regs.push(gpr);
		gpr.addEventListener("mouseover", makeTitle(i));
	}
	
	for (var i = 0; i < registerLabels.length; i++)
		registerLabels[i].addEventListener("click", showDivByIndex(i));
	
	for (var i = 0; i < utilLabels.length; i++)
		utilLabels[i].addEventListener("click", showDivByIndex(i));
	
	biosPicker.addEventListener("change", readBios);
	
	stack.addEventListener("change", function()
	{
		var option = this.selectedOptions[0];
		var address = parseInt(this.value.substr(2), 16);
		goToPC(address);
	});
	
	disasmContainer.addEventListener("scroll", function(e)
	{
		if (psx.memory == null)
			return;
		
		if (this.scrollTop < 10)
		{
			var oldSize = this.scrollHeight;
			disasm.expandTop(psx.memory, disasm.fromAddress - 40, runPC);
			this.scrollTop += this.scrollHeight - oldSize;
		}
		else if (this.scrollTop + this.offsetHeight >= this.scrollHeight - 10)
		{
			disasm.expandBottom(psx.memory, disasm.toAddress + 40, runPC);
		}
	});
	
	addBreakpointButton.addEventListener("click", function()
	{
		var address = prompt("Breakpoint address (hex):");
		if (address == null) return;
		
		var intAddress = parseInt(address, 16);
		dbg.breakpoints.setBreakpoint(intAddress);
	});
	
	document.addEventListener("keydown", function(e)
	{
		switch (e.which)
		{
		case 13: stepOver(); break;
		case 39:
			if (dbg.canStepInto())
				dbg.stepInto();
			break;
		}
	});
}

document.addEventListener("DOMContentLoaded", including.bind(null, requiredScripts, onload));
