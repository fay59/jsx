function run()
{
	var gpr = [0, 0, 49168, 64, 2149576104, 4096, 0, 0, 240, 240, 0, 0, 0, 0, 0, 0, 2149576744, 528489472, 0, 64, 3520, 0, 0, 0, 0, 239, 2147854872, 3868, 2684424176, 2149575936, 2149580544, 2147483648, 0, 0]
	var psx = new PSX(console, null, 524288, [], []);
	psx.reset();
	
	for (var i = 0; i < gpr.length; i++)
		psx.cpu.gpr[i] = gpr[i];

	psx.memory.compiled.compiled[0x8005465c] = {
		code: function(pc, context) {
		var overflowChecked = 0;
		while (true) {
			var interruptPC = this.checkInterrupts(pc);
			if (interruptPC !== undefined) return interruptPC;
			switch (pc) {
			case 0x800544e0:
				this.gpr[29] = this.gpr[29] + -88;
				this.memory.write32(this.gpr[29] + 28, this.gpr[17]);
				this.invalidate(this.gpr[29] + 28);
				this.gpr[17] = -2146959360;
				this.gpr[17] = this.memory.read32(this.gpr[17] + -26720);
				this.memory.write32(this.gpr[29] + 44, this.gpr[31]);
				this.invalidate(this.gpr[29] + 44);
				this.memory.write32(this.gpr[29] + 40, this.gpr[21]);
				this.invalidate(this.gpr[29] + 40);
				this.memory.write32(this.gpr[29] + 36, this.gpr[20]);
				this.invalidate(this.gpr[29] + 36);
				this.memory.write32(this.gpr[29] + 32, this.gpr[18]);
				this.invalidate(this.gpr[29] + 32);
				this.memory.write32(this.gpr[29] + 24, this.gpr[16]);
				this.invalidate(this.gpr[29] + 24);
				this.gpr[21] = this.memory.read16(this.gpr[17] + 430);
				this.gpr[14] = -2146566144;
				this.gpr[14] = this.memory.read16(this.gpr[14] + -4572);
				this.gpr[21] = this.gpr[21] & 0x000007ff;
				this.gpr[20] = this.gpr[5] + 0;
				this.gpr[21] = this.gpr[21] & 0x0000ffff;
				this.gpr[16] = this.gpr[4] + 0;
				this.clock(16);


				this.memory.write16(this.gpr[17] + 422, this.gpr[14]);
				this.invalidate(this.gpr[17] + 422);
				this.gpr[31] = 0x80054528;
				return 0x80054140;
				
			case 0x80054528:
				this.gpr[15] = this.memory.read16(this.gpr[17] + 430);
				this.gpr[18] = 0 + 0;
				this.gpr[24] = this.gpr[15] & 0x000007ff;
				this.clock(3);
				if (this.gpr[21] == this.gpr[24]) {

					pc = 0x8005458c;
					break;
				}

				this.gpr[18] = this.gpr[18] + 1;
				this.clock(3);
				
			case 0x80054540:
				this.gpr[1] = (this.gpr[18] | 0) < 5001;
				this.clock(1);
				if (this.gpr[1] != 0) {

					this.gpr[1] = -2146566144;
					pc = 0x80054574;
					break;
				}
				this.gpr[1] = -2146566144;
				this.gpr[4] = -2146959360;
				this.gpr[5] = -2146959360;
				this.memory.write32(this.gpr[1] + -4576, this.gpr[18]);
				this.invalidate(this.gpr[1] + -4576);
				this.gpr[5] = this.gpr[5] + -26572;
				this.clock(6);


				this.gpr[4] = this.gpr[4] + -26592;
				this.gpr[31] = 0x80054564;
				return 0x8005a910;
				
			case 0x80054564:
				this.gpr[17] = -2146959360;
				this.gpr[17] = this.memory.read32(this.gpr[17] + -26720);
				this.clock(2);
				if (0 == 0) {

					this.gpr[18] = 0 + 0;
					pc = 0x8005458c;
					break;
				}
				this.gpr[18] = 0 + 0;
				this.clock(2);
				
			case 0x80054574:
				this.gpr[25] = this.memory.read16(this.gpr[17] + 430);

				this.gpr[8] = this.gpr[25] & 0x000007ff;
				this.clock(3);
				if (this.gpr[21] != this.gpr[8]) {

					this.gpr[18] = this.gpr[18] + 1;
					pc = 0x80054540;
					break;
				}
				this.gpr[18] = this.gpr[18] + 1;
				this.gpr[18] = 0 + 0;
				this.clock(3);
				
			case 0x8005458c:
				this.clock(0);
				
			case 0x8005458c:
				this.clock(0);
				if (this.gpr[20] == 0) {

					pc = 0x80054678;
					break;
				}

				this.memory.write32(this.gpr[29] + 48, this.gpr[19]);
				this.invalidate(this.gpr[29] + 48);
				this.gpr[1] = this.gpr[20] < 65;
				this.clock(4);
				
			case 0x8005459c:
				this.clock(0);
				if (this.gpr[1] != 0) {

					this.gpr[3] = 0 + 0;
					pc = 0x800545ac;
					break;
				}
				this.gpr[3] = 0 + 0;
				this.clock(2);
				if (0 == 0) {

					this.gpr[19] = 0 + 64;
					pc = 0x800545b0;
					break;
				}
				this.gpr[19] = 0 + 64;
				this.clock(2);
				
			case 0x800545ac:
				this.gpr[19] = this.gpr[20] + 0;
				this.clock(1);
				
			case 0x800545b0:
				this.clock(0);
				if ((this.gpr[19] | 0) <= 0) {

					pc = 0x800545d0;
					break;
				}
				this.clock(2);
				
			case 0x800545b8:
				this.gpr[2] = this.memory.read16(this.gpr[16] + 0);
				this.gpr[3] = this.gpr[3] + 2;
				this.gpr[1] = (this.gpr[3] | 0) < (this.gpr[19] | 0);
				this.gpr[16] = this.gpr[16] + 2;
				this.clock(4);
				if (this.gpr[1] != 0) {

					this.memory.write16(this.gpr[17] + 424, this.gpr[2]);
					this.invalidate(this.gpr[17] + 424);
					pc = 0x800545b8;
					break;
				}
				this.memory.write16(this.gpr[17] + 424, this.gpr[2]);
				this.invalidate(this.gpr[17] + 424);
				this.clock(2);
				
			case 0x800545d0:
				this.gpr[2] = this.memory.read16(this.gpr[17] + 426);

				this.gpr[2] = this.gpr[2] & 0x0000ffcf;
				this.gpr[2] = this.gpr[2] & 0x0000ffff;
				this.gpr[2] = this.gpr[2] | 0x00000010;
				this.gpr[2] = this.gpr[2] & 0x0000ffff;
				this.clock(6);


				this.memory.write16(this.gpr[17] + 426, this.gpr[2]);
				this.invalidate(this.gpr[17] + 426);
				this.gpr[31] = 0x800545f0;
				return 0x80054140;
				
			case 0x800545f0:
				this.gpr[9] = this.memory.read16(this.gpr[17] + 430);

				this.gpr[10] = this.gpr[9] & 0x00000400;
				this.clock(3);
				if (this.gpr[10] == 0) {

					pc = 0x80054654;
					break;
				}

				this.gpr[18] = this.gpr[18] + 1;
				this.clock(3);
				
			case 0x80054608:
				this.gpr[1] = (this.gpr[18] | 0) < 5001;
				this.clock(1);
				if (this.gpr[1] != 0) {

					this.gpr[1] = -2146566144;
					pc = 0x8005463c;
					break;
				}
				this.gpr[1] = -2146566144;
				this.gpr[4] = -2146959360;
				this.gpr[5] = -2146959360;
				this.memory.write32(this.gpr[1] + -4576, this.gpr[18]);
				this.invalidate(this.gpr[1] + -4576);
				this.gpr[5] = this.gpr[5] + -26532;
				this.clock(6);


				this.gpr[4] = this.gpr[4] + -26552;
				this.gpr[31] = 0x8005462c;
				return 0x8005a910;
				
			case 0x8005462c:
				this.gpr[17] = -2146959360;
				this.gpr[17] = this.memory.read32(this.gpr[17] + -26720);
				this.clock(2);
				if (0 == 0) {

					this.gpr[18] = 0 + 0;
					pc = 0x80054654;
					break;
				}
				this.gpr[18] = 0 + 0;
				this.clock(2);
				
			case 0x8005463c:
				this.gpr[11] = this.memory.read16(this.gpr[17] + 430);

				this.gpr[12] = this.gpr[11] & 0x00000400;
				this.clock(3);
				if (this.gpr[12] != 0) {

					this.gpr[18] = this.gpr[18] + 1;
					pc = 0x80054608;
					break;
				}
				this.gpr[18] = this.gpr[18] + 1;
				this.gpr[18] = 0 + 0;
				this.clock(3);
				
			case 0x80054654:
				this.clock(0);
				
			case 0x80054654:
				this.clock(0);


				this.gpr[31] = 0x8005465c;
				return 0x80054140;
				
			case 0x8005465c:
				this.clock(0);


				this.gpr[31] = 0x80054664;
				return 0x80054140;
				
			case 0x80054664:
				this.gpr[20] = this.gpr[20] - this.gpr[19];
				this.clock(1);
				if (this.gpr[20] != 0) {

					this.gpr[1] = this.gpr[20] < 65;
					pc = 0x8005459c;
					break;
				}
				this.gpr[1] = this.gpr[20] < 65;
				this.gpr[19] = this.memory.read32(this.gpr[29] + 48);
				this.clock(4);
				
			case 0x80054678:
				this.gpr[2] = this.memory.read16(this.gpr[17] + 426);

				this.gpr[2] = this.gpr[2] & 0x0000ffcf;
				this.gpr[2] = this.gpr[2] & 0x0000ffff;
				this.memory.write16(this.gpr[17] + 426, this.gpr[2]);
				this.invalidate(this.gpr[17] + 426);
				this.gpr[13] = this.memory.read16(this.gpr[17] + 430);

				this.gpr[14] = this.gpr[13] & 0x000007ff;
				this.clock(8);
				if (this.gpr[21] != this.gpr[14]) {

					this.gpr[1] = -2146566144;
					pc = 0x800546a8;
					break;
				}
				this.gpr[1] = -2146566144;
				this.clock(2);
				if (0 == 0) {

					this.memory.write32(this.gpr[1] + -4576, this.gpr[18]);
					this.invalidate(this.gpr[1] + -4576);
					pc = 0x800546f0;
					break;
				}
				this.memory.write32(this.gpr[1] + -4576, this.gpr[18]);
				this.invalidate(this.gpr[1] + -4576);
				this.clock(2);
				
			case 0x800546a8:
				this.clock(0);
				
			case 0x800546a8:
				this.gpr[18] = this.gpr[18] + 1;
				this.gpr[1] = (this.gpr[18] | 0) < 5001;
				this.clock(2);
				if (this.gpr[1] != 0) {

					this.gpr[1] = -2146566144;
					pc = 0x800546d8;
					break;
				}
				this.gpr[1] = -2146566144;
				this.gpr[4] = -2146959360;
				this.gpr[5] = -2146959360;
				this.memory.write32(this.gpr[1] + -4576, this.gpr[18]);
				this.invalidate(this.gpr[1] + -4576);
				this.gpr[5] = this.gpr[5] + -26492;
				this.clock(6);


				this.gpr[4] = this.gpr[4] + -26512;
				this.gpr[31] = 0x800546d0;
				return 0x8005a910;
				
			case 0x800546d0:
				this.clock(0);
				if (0 == 0) {

					this.gpr[31] = this.memory.read32(this.gpr[29] + 44);
					pc = 0x800546f4;
					break;
				}
				this.gpr[31] = this.memory.read32(this.gpr[29] + 44);
				this.clock(2);
				
			case 0x800546d8:
				this.gpr[15] = this.memory.read16(this.gpr[17] + 430);

				this.gpr[24] = this.gpr[15] & 0x000007ff;
				this.clock(3);
				if (this.gpr[21] != this.gpr[24]) {

					this.gpr[1] = -2146566144;
					pc = 0x800546a8;
					break;
				}
				this.gpr[1] = -2146566144;
				this.memory.write32(this.gpr[1] + -4576, this.gpr[18]);
				this.invalidate(this.gpr[1] + -4576);
				this.clock(3);
				
			case 0x800546f0:
				this.gpr[31] = this.memory.read32(this.gpr[29] + 44);
				this.clock(1);
				
			case 0x800546f4:
				this.gpr[16] = this.memory.read32(this.gpr[29] + 24);
				this.gpr[17] = this.memory.read32(this.gpr[29] + 28);
				this.gpr[18] = this.memory.read32(this.gpr[29] + 32);
				this.gpr[20] = this.memory.read32(this.gpr[29] + 36);
				this.gpr[21] = this.memory.read32(this.gpr[29] + 40);
				this.clock(5);


				this.gpr[29] = this.gpr[29] + 88;
				return this.gpr[31];
				
			default:
				this.panic('unreferenced block 0x' + Recompiler.formatHex(pc), pc);
				break;
			}
		}
	},
		jitTime: 3768,
		labels: [2147828960, 2147829032, 2147829056, 2147829092, 2147829108, 2147829132, 2147829132, 2147829148, 2147829164, 2147829168, 2147829176, 2147829200, 2147829232, 2147829256, 2147829292, 2147829308, 2147829332, 2147829332, 2147829340, 2147829348, 2147829368, 2147829416, 2147829416, 2147829456, 2147829464, 2147829488, 2147829492],
		name: ".00000000",
		ranges: [],
		totalCount: 159,
		unimplemented: {}
	};
	
	psx.cpu.executeBlock(0x8005465c);
	document.querySelector("#ra").textContent = "RA is " + psx.cpu.gpr[31].toString(16);
}

var loadScriptsAndRun = including.bind(null,
	"js/core/disasm.js",
	"js/core/r3000a.js",
	"js/core/compiled.js",
	"js/core/hwregs.js",
	"js/core/parallel.js",
	"js/core/memory.js",
	"js/core/recompiler.js",
	"js/core/recompiler-old.js",
	"js/core/asm.js",
	"js/core/mdec.js",
	"js/core/gpu.js",
	"js/debugger/comparator.js",
	"js/core/psx.js",
	"js/core/spu.js",
	run);

document.addEventListener("DOMContentLoaded", loadScriptsAndRun);