var psx = null;
var dbg = null;

document.addEventListener("DOMContentLoaded", function()
{
	const disassemblyLength = 25;
	
	var status = new StatusQueue(document.querySelector("#status"));
	var disasm = new DisassemblyTable(document.querySelector("#disasm"));
	psx = new R3000a();
	dbg = new Debugger(psx);
	
	var runButton = document.querySelector("#run");
	var stepOverButton = document.querySelector("#step-over");
	var stepIntoButton = document.querySelector("#step-into");
	var stepOutButton = document.querySelector("#step-out");
	var pauseButton = document.querySelector("#pause");
	var goToButton = document.querySelector("#goto");
	var disasmContainer = document.querySelector("#disasm-container");
	var breakpoints = document.querySelector("#breakpoints");
	var addBreakpointButton = document.querySelector("#add-breakpoint");
	
	var stack = document.querySelector("#stack");
	stack.addEventListener("change", function()
	{
		var option = this.selectedOptions[0];
		var address = parseInt(this.value.substr(2), 16);
		disasm.reset(psx.memory, address - 8, address + 0x80, address, runPC, toggleBreakpoint);
	});
	
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
	
	function runPC()
	{
		var pc = parseInt(this.parentNode.childNodes[1].textContent, 16);
		if (event.altKey)
		{
			diagnostics.log("setting PC to " + Recompiler.formatHex(pc));
			dbg.pc = pc;
			pauseButton.disabled = true;
			disasm.select(pc);
		}
		else if (pc > dbg.pc)
		{
			diagnostics.log("running to " + Recompiler.formatHex(pc));
			dbg.runUntil(pc);
		}
	}
	
	function addBreakpoint(address)
	{
		var hexAddress = Recompiler.formatHex(address);
		dbg.setBreakpoint(address);
		var li = document.createElement('li');
		li.setAttribute('data-address', address);
		li.textContent = " " + hexAddress;
		var del = document.createElement('span');
		del.textContent = '[-]';
		del.addEventListener("click", function() {
			dbg.removeBreakpoint(address);
			breakpoints.removeChild(li);
		});
		li.insertBefore(del, li.firstChild);
		breakpoints.appendChild(li);
	}
	
	function toggleBreakpoint()
	{
		var self = this;
		var address = parseInt(this.textContent, 16);
		if (dbg.breakpoints.indexOf(address) == -1)
		{
			addBreakpoint(address);
		}
		else
		{
			dbg.removeBreakpoint(address);
			var li = breakpoints.querySelector("li[data-address=" + address + "]");
			breakpoints.removeChild(li);
		}
	}
	
	var diagnostics = {
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
	
	dbg.diags = diagnostics;
	psx.setDiagnosticsOutput(diagnostics);
	
	dbg.onstepped = function()
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
		diagnostics.log("BIOS » " + hexPC);
	}
	
	dbg.onsteppedinto = refreshStack;
	dbg.onsteppedout = refreshStack;
	
	document.querySelector("#bios-picker").addEventListener("change", function()
	{
		var reader = new FileReader();
		reader.onload = function()
		{
			var bios = new GeneralPurposeBuffer(reader.result);
			var hardwareRegisters = new HardwareRegisters();
			var parallelPort = new ParallelPortMemoryRange();
			var memory = new MemoryMap(hardwareRegisters, parallelPort, bios);
			
			psx.stop();
			dbg.reset(R3000a.bootAddress, memory);
			
			var message = "Loaded BIOS » 0x" + Recompiler.formatHex(dbg.pc);
			status.display(message, 'black');
		}
		reader.readAsArrayBuffer(this.files[0]);
	});
	
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
	
	var regContainers = document.querySelectorAll(".regs");
	var regs = [];
	for (var i = 0; i < 16; i++)
	{
		var gpr = regField("GPR", 4, i, Disassembler.registerNames);
		var cpr = regField("CPR", 4, i, Disassembler.cop0RegisterNames);
		regContainers[0].appendChild(gpr);
		regContainers[1].appendChild(cpr);
		regs.push(gpr, cpr);
	}
	
	for (var i = 16; i < 32; i++)
	{
		var gpr = regField("GPR", 4, i, Disassembler.registerNames);
		regContainers[0].appendChild(gpr);
		regs.push(gpr);
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
	
	var registerLabels = document.querySelectorAll("#regs > legend span");
	for (var i = 0; i < registerLabels.length; i++)
		registerLabels[i].addEventListener("click", showDivByIndex(i));
	
	var utilLabels = document.querySelectorAll("#utils > legend span");
	for (var i = 0; i < utilLabels.length; i++)
		utilLabels[i].addEventListener("click", showDivByIndex(i));
	
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
	
	pauseButton.disabled = true;
	
	var run = dbg.run.bind(dbg);
	var stepOver = dbg.stepOver.bind(dbg);
	var stepInto = dbg.stepInto.bind(dbg);
	var stepOut = dbg.stepOut.bind(dbg);
	
	function pause()
	{
		// TODO cannot pause with the new system
		pauseButton.disabled = true;
	}
	
	function goTo()
	{
		var address = prompt("Go to address (hex):", Recompiler.formatHex(dbg.pc));
		if (address !== null)
		{
			var realAddress = parseInt(address, 16) - 4;
			disasm.reset(psx.memory, realAddress - 8, realAddress + 0x80, realAddress, runPC, toggleBreakpoint);
		}
	}
	
	runButton.addEventListener("click", run);
	stepOverButton.addEventListener("click", stepOver);
	stepIntoButton.addEventListener("click", stepInto);
	stepOutButton.addEventListener("click", stepOut);
	pauseButton.addEventListener("click", pause);
	goToButton.addEventListener("click", goTo);
	
	addBreakpointButton.addEventListener("click", function()
	{
		var address = prompt("Breakpoint address (hex):");
		if (address == null) return;
		
		var intAddress = parseInt(address, 16);
		addBreakpoint(intAddress);
	});
	
	document.addEventListener("keydown", function(e)
	{
		switch (e.which)
		{
			case 13: stepOver(); break;
			case 27: pause(); break;
			case 37: stepOut(); break;
			case 39:
				if (dbg.canStepInto())
					dbg.stepInto();
				break;
			
			case 9:
				if (e.shiftKey) goTo();
				break;
		}
	});
	
	status.display("← Waiting for a BIOS...");
});