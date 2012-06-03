document.addEventListener("DOMContentLoaded", including.bind(null,
	"js/core/disasm.js", "js/core/r3000a.js", "js/core/compiled.js", "js/core/hwregs.js",
	"js/core/parallel.js", "js/core/memory.js", "js/core/recompiler.js", "js/core/recompiler-old.js", "js/core/asm.js",
	"js/core/mdec.js", "js/core/gpu.js", "js/debugger/comparator.js", "js/core/psx.js", "js/core/spu.js", function()
	{
		var bios = document.querySelector("#bios");
		var biosReader = new FileReader();
	
		function run()
		{
			psx = [
				new PSX(console, null, biosReader.result, [], []),
				new PSX(console, null, biosReader.result, [], []),
			];
			
			psx[0].reset();
			psx[1].reset();
			
			psx[0].memory.compiled.recompiler = new OldRecompiler();
			
			var pc = R3000a.bootAddress;
			var trace = [pc];
			try
			{
				while (true)
				{
					var newPC = [0,0];
					newPC[0] = psx[0].cpu.executeBlock(pc);
					newPC[1] = psx[1].cpu.executeBlock(pc);
					
					var foo = 3;
					
					for (var i = 1; i < newPC.length; i++)
					{
						if (newPC[i] != newPC[i - 1])
						{
							throw new Error("Program counters differ after " + pc.toString() + ": " + newPC);
						}
					}
					
					for (var i = 0; i < 34; i++)
					{
						var gpr = [
							psx[0].cpu.gpr[i],
							psx[1].cpu.gpr[i]
						];
							
						for (var j = 1; j < gpr.length; j++)
						{
							if (gpr[j] != gpr[j-1])
							{
								var pair = gpr.map(function(x) { return x.toString(16) });
								throw new Error("Register " + Disassembler.registerNames[i] + " differs after " + pc.toString(16) + ": " + pair + "; PCs are " + newPC);
							}
						}
					}
					
					pc = newPC[0];
					trace.push(pc);
					
					if (pc == 0x8005465c)
					{
						console.log(psx[1].cpu.gpr);
					}
				}
				psx.cpu.run(R3000a.bootAddress, comparator);
			}
			catch (e)
			{
				document.querySelector("#crash").textContent = e.toString();
				
				var ul = document.querySelector("#trace");
				for (var i = trace.length - 1; i >= 0; i--)
				{
					var li = document.createElement('li');
					li.textContent = trace[i].toString(16);
					ul.appendChild(li);
				}
			}
		}
		
		function loadFiles(reader)
		{
			reader.addEventListener("load", run);
			reader.readAsArrayBuffer(this.files[0]);
		}
		
		bios.addEventListener("change", loadFiles.bind(bios, biosReader));
	})
);