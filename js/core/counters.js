var Counters = function(psx)
{
	this.psx = psx;
	this.counters = [
		new Counter(psx, this),
		new Counter(psx, this),
		new Counter(psx, this),
		new Counter(psx, this)
	];
	
	this.counters[0]._onWriteMode = function()
	{
		this.rate = (this.mode & Counter.Rc0PixelClock) ? 5 : 1;
	}
	
	this.counters[1]._onWriteMode = function()
	{
		this.rate = (this.mode & Counter.Rc1HSyncClock)
			? R3000a.cyclesPerSecond / (psx.emulatedSystem.frameRate * psx.emulatedSystem.hsyncTotal)
			: 1;
	}
	
	this.counters[2]._onWriteMode = function()
	{
		this.rate = (this.mode & Counter.Rc2OneEighthClock) ? 8 : 1;
		if (this.mode & Counter.Rc2Disable)
			this.rate = 0xffffffff;
	}
	
	this.assumedStart = 0;
	this.nextTarget = 0;
	
	this.spuSyncCount = 0;
	this.hsyncCount = 0;
	this.reset();
}

Counters.prototype.reset = function()
{
	this.spuSyncCount = 0;
	this.hsyncCount = 0;
	
	with (this.counters[0])
	{
		rate = 1;
		irq = 0x10;
	}
	
	with (this.counters[1])
	{
		rate = 1;
		irq = 0x20;
	}
	
	with (this.counters[2])
	{
		rate = 1;
		irq = 0x40;
	}
	
	with (this.counters[3])
	{
		var system = this.psx.emulatedSystem;
		rate = 1;
		mode = Counter.RcCountToTarget;
		target = Math.floor(R3000a.cyclesPerSecond / (system.frameRate * system.hsyncTotal));
	}
	
	for (var i = 0; i < this.counters.length; i++)
		this.counters[i].writeCount(0);
	
	this.set();
}

Counters.prototype.set = function()
{
	this.assumedStart = this.psx.cpu.cycles;
	this.nextTarget = 0x7fffffff | 0;
	
	for (var i = 0; i < this.counters.length; i++)
	{
		var counter = this.counters[i];
		var countToUpdate = counter.cycle - (this.assumedStart - counter.cycleStart);
		if (countToUpdate < 0)
		{
			this.nextTarget = 0;
			break;
		}
		
		if (countToUpdate < this.nextTarget)
			this.nextTarget = countToUpdate;
	}
}

Counters.prototype.update = function()
{
	var cycles = this.psx.cpu.cycles;
	
	for (var i = 0; i < 3; i++)
	{
		var counter = this.counters[i];
		if (cycles - counter.cycleStart >= counter.cycle)
			counter.reset();
	}
	
	var counter = this.counters[3];
	if (cycles - counter.cycleStart >= counter.cycle)
	{
		counter.reset();
		this.spuSyncCount++;
		this.hsyncCount++;
		
		var system = this.psx.emulatedSystem;
		
		if (this.spuSyncCount >= system.spuUpdateInterval)
		{
			this.spuSyncCount = 0;
			// TODO spu
			// if (SPU_Async)
			//	SPU_async(system.spuUpdateInterval * counter.target);
		}
		
		if (this.hsyncCount >= system.hsyncTotal)
		{
			this.hsyncCount = 0;
			this.psx.hardwareRegisters.setIrq(1);
			this.psx.gpu.updateLace();
			this.psx.cpu.yield();
		}
	}
}

Counters.prototype.install = function(hw)
{
	this.counters[0].wire(hw, 0x1f801100);
	this.counters[1].wire(hw, 0x1f801110);
	this.counters[2].wire(hw, 0x1f801120);
}

var Counter = function(psx, counters)
{
	this.psx = psx;
	this.counters = counters;
	
	this.mode = 0;
	this.target = 0;
	
	this.rate = 0;
	this.irq = 0;
	this.counterState = 0;
	this.irqState = 0;
	this.cycle = 0;
	this.cycleStart = 0;
}

Counter.Rc0Gate			= 0x0001, // 0	not implemented
Counter.Rc1Gate			= 0x0001, // 0	not implemented
Counter.Rc2Disable		= 0x0001, // 0	partially implemented
Counter.RcUnknown1		= 0x0002, // 1	?
Counter.RcUnknown2		= 0x0004, // 2	?
Counter.RcCountToTarget	= 0x0008, // 3
Counter.RcIrqOnTarget	= 0x0010, // 4
Counter.RcIrqOnOverflow	= 0x0020, // 5
Counter.RcIrqRegenerate	= 0x0040, // 6
Counter.RcUnknown7		= 0x0080, // 7	?
Counter.Rc0PixelClock	= 0x0100, // 8	fake implementation
Counter.Rc1HSyncClock	= 0x0100, // 8
Counter.Rc2Unknown8		= 0x0100, // 8	?
Counter.Rc0Unknown9		= 0x0200, // 9	?
Counter.Rc1Unknown9		= 0x0200, // 9	?
Counter.Rc2OneEighthClock = 0x0200, // 9
Counter.RcUnknown10		= 0x0400, // 10   ?
Counter.RcCountEqTarget	= 0x0800, // 11
Counter.RcOverflow		= 0x1000, // 12
Counter.RcUnknown13		= 0x2000, // 13   ? (always zero)
Counter.RcUnknown14		= 0x4000, // 14   ? (always zero)
Counter.RcUnknown15		= 0x8000, // 15   ? (always zero)

Counter.CountToTarget = 0;
Counter.CountToOverflow = 1;
Counter.baseRateShift = 1;

Counter.prototype.wire = function(hwregs, address)
{
	var self = this;
	hwregs.wire(address,
		function() {
			self.counters.update();
			return self.readCount();
		},
		function(value) {
			self.counters.update();
			self.writeCount(value);
		}
	);
	
	hwregs.wire(address + 4,
		function() {
			self.counters.update();
			return self.readMode();
		},
		function(value) {
			self.counters.update();
			self.writeMode(value);
		}
	);
	
	hwregs.wire(address + 8,
		function() {
			self.counters.update();
			return self.readTarget();
		},
		function(value) {
			self.counters.update();
			self.writeTarget(value);
		}
	);
}

Counter.prototype.readCount = function()
{
	return ((this.psx.cpu.cycles - this.cycleStart) / this.rate) & 0xffff;
}

Counter.prototype.writeCount = function(value)
{
	value &= 0xffff;
	this.cycleStart = this.psx.cpu.cycles - value * this.rate;
	
	if (value < this.target)
	{
		this.cycle = this.target * this.rate;
		this.counterState = Counter.CountToTarget;
	}
	else
	{
		this.cycle = 0xffff * this.rate;
		this.counterState = Counter.CountToOverflow;
	}
	
	this.counters.set();
}

Counter.prototype.readTarget = function()
{
	return this.target;
}

Counter.prototype.writeTarget = function(value)
{
	this.target = value;
	this.counters.set();
}

Counter.prototype.readMode = function()
{
	var oldMode = this.mode;
	this.mode &= 0xe7ff;
	return oldMode;
}

Counter.prototype.writeMode = function(value)
{
	this.mode = value;
	this.irqState = false;
	this._onWriteMode();
	this.counters.set();
}

Counter.prototype.reset = function()
{
	if (this.counterState == Counter.CountToTarget)
	{
		var count = (this.mode & Counter.RcCountToTarget)
			? Math.floor((this.psx.cpu.cycles - this.cycleStart) / this.rate) - this.target
			: this.readCount();
		this.writeCount(count);
		
		if (this.mode & Counter.RcIrqOnTarget)
		{
			if ((this.mode & RcIrqRegenerate) || !this.irqState)
			{
				this.psx.hardwareRegisters.setIrq(this.irq);
				this.irqState = true;
			}
		}
		
		this.mode |= Counter.RcCountEqTarget;
	}
	else if (this.counterState == Counter.CountToOverflow)
	{
		var count = Math.floor((this.psx.cpu.cycles - this.cycleStart) / this.rate) - 0xffff;
		this.writeCount(count);
		if (this.mode & Counter.RcIrqOnOverflow)
		{
			if ((this.mode & Counter.RcIrqRegenerate) || !this.irqState)
			{
				this.psx.hardwareRegisters.setIrq(this.irq);
				this.irqState = true;
			}
		}
	}
	
	this.counters.set();
}

Counter.prototype._onWriteMode = function() {}
