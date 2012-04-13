document.addEventListener("DOMContentLoaded", function()
{
	const disassemblyLength = 25;
	
	var status = new StatusQueue(document.querySelector("#status"));
	var disasm = new DisassemblyTable(document.querySelector("#disasm"));
	var psx = new R3000a();
	var dbg = new Debugger(psx);
	
	var stepOverButton = document.querySelector("#step-over");
	var stepIntoButton = document.querySelector("#step-into");
	var pauseButton = document.querySelector("#pause");
	var goToButton = document.querySelector("#goto");
	var disasmContainer = document.querySelector("#disasm-container");
		
	function runPC()
	{
		var pc = parseInt(this.parentNode.childNodes[1].textContent, 16);
		if (event.altKey)
		{
			diagnostics.log("setting PC to " + Recompiler.formatHex32(pc));
			dbg.pc = pc;
			runHandle.interrupt();
			pauseButton.disabled = true;
			disasm.select(pc);
		}
		else if (pc > dbg.pc)
		{
			diagnostics.log("running to " + Recompiler.formatHex32(pc));
			runHandle = dbg.runUntil(pc);
			pauseButton.disabled = false;
			stepOverButton.disabled = true;
			stepIntoButton.disabled = true;
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
				disasm.reset(psx.memory, dbg.pc - 8, dbg.pc + 0x80, dbg.pc, runPC);
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
		diagnostics.log("BIOS » " + Recompiler.formatHex32(dbg.pc));
	}
	
	document.querySelector("#rom-picker").addEventListener("change", function()
	{
		var reader = new FileReader();
		reader.onload = function()
		{
			var memory = new MemoryMap(reader.result);
			
			psx.stop();
			psx.hardwareReset();
			psx.softwareReset(memory);
			dbg.pc = R3000a.bootAddress;
			dbg.onstepped();
			
			var message = "Loaded BIOS » 0x" + Recompiler.formatHex32(dbg.pc);
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
		field.size = (byteSize * 2) + 3;
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
		var gpr = regField("GPR", 8, i, Disassembler.registerNames);
		var cpr = regField("CPR", 4, i, Disassembler.cop0RegisterNames);
		regContainers[0].appendChild(gpr);
		regContainers[1].appendChild(cpr);
		regs.push(gpr, cpr);
	}
	
	for (var i = 16; i < 32; i++)
	{
		var gpr = regField("GPR", 8, i, Disassembler.registerNames);
		regContainers[0].appendChild(gpr);
		regs.push(gpr);
	}
	
	var runHandle = {interrupt: function() {}};
	
	var registerLabels = document.querySelectorAll("#regs > legend span");
	var regsDiv = document.querySelector("#regs > div");
	for (var i = 0; i < registerLabels.length; i++)
	{
		registerLabels[i].addEventListener("click", function()
		{
			regsDiv.scrollTop = 0;
			var current = this;
			while (current.previousElementSibling != null)
			{
				regsDiv.scrollTop += 475;
				current = current.previousElementSibling;
			}
		});
	}
	
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
	
	var stepOver = dbg.stepOver.bind(dbg);
	
	function stepInto()
	{
		dbg.stepInto();
	}
	
	function pause()
	{
		runHandle.interrupt();
		pauseButton.disabled = true;
	}
	
	function goTo()
	{
		var address = prompt("Go to address (hex):", Recompiler.formatHex32(dbg.pc));
		var realAddress = parseInt(address, 16) - 4;
		disasm.reset(psx.memory, realAddress - 8, realAddress + 0x80, dbg.pc, runPC);
	}
	
	stepOverButton.addEventListener("click", stepOver);
	stepIntoButton.addEventListener("click", stepInto);
	pauseButton.addEventListener("click", pause);
	goToButton.addEventListener("click", goTo);
	
	document.addEventListener("keydown", function(e)
	{
		switch (e.which)
		{
			case 13: stepOver(); break;
			case 27: pause(); break;
			case 39:
				if (dbg.canStepInto())
					dbg.stepInto();
				break;
			
			case 9:
				if (e.shiftKey) goTo();
				break;
		}
	});
	
	dbg.onstepped();
	status.display("← Waiting for a BIOS...");
});