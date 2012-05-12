var DMARegisters = function()
{
	this.madr = 0; // memory address
	this.bcr = 0; // block size & block count
	this.chcr = 0; // command to take
}

DMARegisters.prototype.getSize = function()
{
	return (this.bcr >>> 16) * (this.bcr & 0xffff);
}

DMARegisters.prototype.wire = function(hwregs, address, action)
{
	var self = this;
	hwregs.wire(address,
		function() { return self.madr; },
		function(value) { self.madr = value; }
	);
	
	hwregs.wire(address + 4,
		function() { return self.bcr; },
		function(value) { self.bcr = value; }
	);
	
	hwregs.wire(address + 8,
		function() { return self.chcr; },
		function(value) {
			self.chcr = value;
			action.call(this);
		}
	);
}

var Counter = function(psx, count, target, mode, rate, interrupt)
{
	this.psx = psx;
	
	this.count = 0;
	this.target = 0;
	this.mode = 0;
	
	this.startCycle = 0;
	this.targetCycle = 0;
	this.rate = 0;
	this.interrupt = 0;
}

Counter.baseRateShift = 1;

Counter.prototype.wire = function(hwregs, address)
{
	var self = this;
	hwregs.wire(address,
		function() { return self.readCount(); },
		function(value) { self.writeCount(value); }
	);
	
	hwregs.wire(address + 4,
		function() { return self.mode; },
		function(value) { self.writeMode(value); }
	);
	
	hwregs.wire(address + 8,
		function() { return self.target; },
		function(value) { self.writeTarget(value); }
	);
}

Counter.prototype.readCount = function()
{
	var cycles = this.mode & 0x80
		? (this.psx.cycles - this.startCycle)
		: this.psx.cycles;
	return (this.count + 2 * cycles / this.rate) & 0xffff;
}

Counter.prototype.writeCount = function(value)
{
	this.count = value & 0xffff;
	this.updateTargetCycle();
}

Counter.prototype.writeTarget = function(value)
{
	this.target = value;
	this.updateTargetCycle();
}

Counter.prototype.writeMode = function(value)
{
	this.mode = value;
	this.count = 0;
	this.updateRate();
	this.updateTargetCycle();
}

Counter.prototype.updateRate = function()
{
	// default implementation does nothing
}

Counter.prototype.updateTargetCycle = function(startCycle)
{
	this.startCycle = this.psx.cpu.cycles;
	if (this.mode & 0x30)
	{
		var target = (this.mode & 0x10) ? this.target : 0xffff;
		this.targetCycle = ((target - this.count) * this.rate) >>> Counter.baseRateShift;
	}
	else
	{
		this.targetCycle = Infinity;
	}
}

Counter.prototype.test = function()
{
	if (this.psx.cpu.cycles - this.startCycle >= this.targetCycle)
	{
		this.reset();
		return true;
	}
	return false;
}

Counter.prototype.reset = function()
{
	this.count = 0;
	this.updateTargetCycle();
	
	var translated = this.psx.memory.translate(0x1f801070);
	translated.buffer[translated.offset] |= this.interrupt;
	
	if ((this.mode & 0x40) == 0) // 0x40: do not repeat
		this.targetCycle = Infinity;
}

var HardwareRegisters = function(psx)
{
	this.psx = psx;
	
	this.unknownReads = {};
	this.unknownWrites = {};
	
	this.u8 = {length: 0x2000};
	this.u16 = {length: 0x2000 >> 1};
	this.u32 = {length: 0x2000 >> 2};
	
	this._createCounters();
	this._attachDevices.apply(this, Array.prototype.slice.call(arguments, 1));
}

HardwareRegisters.prototype.update = function()
{
	var counterOrder = [3, 0, 1, 2];
	for (var i = 0; i < counterOrder.length; i++)
	{
		var counter = this.counters[counterOrder[i]];
		counter.test();
	}
}

HardwareRegisters.prototype.wire = function(address, getter, setter)
{
	if (!isFinite(address) || address < 0x1f801000)
		throw new Error("address is not finite or too small");
	
	address -= 0x1f801000;
	this.u32.__defineGetter__(address >>> 2, getter);
	this.u32.__defineSetter__(address >>> 2, setter);
	
	this.u16.__defineGetter__(address >>> 1, function() { return getter() & 0xffff; });
	this.u16.__defineGetter__((address >>> 1) + 1, function() { return getter() >>> 16; });
	this.u16.__defineSetter__(address >>> 1, function(value) { setter((getter() & 0xffff0000) | value); });
	this.u16.__defineSetter__((address >>> 1) + 1, function(value) { setter((getter() & 0xffff) | (value << 16)); });
}

HardwareRegisters.prototype.wire16 = function(address, getter, setter)
{
	address -= 0x1f801000;
	var address16 = address >>> 1;
	if (address % 4 == 0)
	{
		var self = this;
		this.u32.__defineGetter__(address >>> 2, function() {
			return self.u16[address16] | (self.u16[address16 + 1] << 16);
		});
		this.u32.__defineSetter__(address >>> 2, function(value) {
			self.u16[address16] = value & 0xffff;
			self.u16[address16 + 1] = (value & 0xffff0000) >>> 16;
		});
	}
	
	this.u16.__defineGetter__(address16, getter);
	this.u16.__defineSetter__(address16, setter);
}

HardwareRegisters.unimplementedRegisters = [
	0x1f801000, 0x1f801004, 0x1f801008, 0x1f80100c, 0x1f801010, 0x1f80101c,
	0x1f802041, 0x1f801018, 0x1f8016c0, 0x1f8016c2,
	
	// interrupts (those don't need special handling)
	0x1f801070, 0x1f801074,
	
	// DMA control register
	0x1f8010f0,
	
	// SPU
	0x1f801da6, 0x1f801da8, 0x1f801daa, 0x1f801dac, 0x1f801dae
];

HardwareRegisters.prototype._createCounters = function()
{
	var psx = this.psx;
	this.counters = [
		new Counter(psx, 0, 0, 0, 1, 0x10),
		new Counter(psx, 0, 0, 0, 1, 0x20),
		new Counter(psx, 0, 0, 0, 1, 0x40),
		new Counter(psx, 0, 1, 0x58, 0, 0x01)
	];
	
	var vsyncCounter = this.counters[3];
	vsyncCounter.rate = Math.floor(R3000a.cyclesPerSecond / psx.framesPerSecond);
	vsyncCounter.rate -= Math.floor(vsyncCounter.rate / 262) * 22;
	
	// override vsyncCounter's update function to trigger GPU-related stuff
	vsyncCounter.test = function()
	{
		if (Counter.prototype.test.call(this))
		{
			if (this.mode & 0x10000)
			{
				this.psx.gpu.updateLace();
				this.psx.cpu.yield();
			}
			else
			{
				var translated = this.psx.memory.translate(0x1f801070);
				translated.buffer[translated.offset] |= 1;
			}
			this.mode ^= 0x10000;
		}
	}
	
	// override counter 2's start function: LSB must be set
	this.counters[2].updateTargetCycle = function()
	{
		this.startCycle = this.psx.cpu.cycles;
		if ((this.mode & 0x01) && (this.mode & 0x30))
		{
			var target = (this.mode & 0x10) ? this.target : 0xffff;
			this.cycles = ((target - this.count) * this.rate) >>> Counter.baseRateShift;
		}
		else
		{
			this.cycles = 0xffffffff;
		}
	}
	
	// override updateRate
	this.counters[0].updateRate = function()
	{
		this.rate = (this.mode & 0x300) == 0x100
			? vsyncCounter.rate / 386 / 262
			: 1;
	}
	
	this.counters[1].updateRate = function()
	{
		this.rate = (this.mode & 0x300) == 0x100
			? vsyncCounter.rate / 262
			: 1;
	}
	
	this.counters[1].updateRate = function()
	{
		this.rate = (this.mode & 0x300) == 0x200 ? 8 : 1;
	}
	
	this.counters[0].wire(this, 0x1f801100);
	this.counters[1].wire(this, 0x1f801110);
	this.counters[2].wire(this, 0x1f801120);
}

HardwareRegisters.prototype._attachDevices = function()
{
	var self = this;
	function getter(buffer, index)
	{
		return function() { return buffer[index]; }
	}
	
	function setter(buffer, index)
	{
		return function(value) { buffer[index] = value; }
	}
	
	function undef_getter(buffer, index, shift)
	{
		return function()
		{
			var address = 0x1F801000 + index;
			var strAddress = address.toString(16);
			if (HardwareRegisters.unimplementedRegisters.indexOf(address) == -1)
			{
				self.unknownReads[address] = true;
				self.psx.diags.warn("reading register " + strAddress);
			}
			return buffer[index >>> shift];
		};
	}
	
	function undef_setter(buffer, index, shift)
	{
		return function(value)
		{
			var address = 0x1F801000 + index;
			var strAddress = address.toString(16);
			if (HardwareRegisters.unimplementedRegisters.indexOf(address) == -1)
			{
				self.unknownWrites[address] = true;
				self.psx.diags.warn("writing register " + strAddress + " -> " + value.toString(16));
			}
			buffer[index >>> shift] = value;
		};
	}
	
	this.backbuffer = new ArrayBuffer(0x2000);
	
	var u8 = new Uint8Array(this.backbuffer);
	var u16 = new Uint16Array(this.backbuffer);
	var u32 = new Uint32Array(this.backbuffer);
	
	for (var i = 0; i < arguments.length; i++)
		arguments[i].install(this);
	
	for (var i = 0; i < 0x2000; i++)
	{
		if (i % 4 == 0 && !((i >>> 2) in this.u32))
		{
			this.u32.__defineGetter__(i >>> 2, undef_getter(u32, i, 2));
			this.u32.__defineSetter__(i >>> 2, undef_setter(u32, i, 2));
		}
		
		if (i % 2 == 0 && !((i >>> 1) in this.u16))
		{
			this.u16.__defineGetter__(i >>> 1, undef_getter(u16, i, 1));
			this.u16.__defineSetter__(i >>> 1, undef_setter(u16, i, 1));
		}
		
		if (!(i in this.u8))
		{
			this.u8.__defineGetter__(i, undef_getter(u8, i, 0));
			this.u8.__defineSetter__(i, undef_setter(u8, i, 0));
		}
	}
}
