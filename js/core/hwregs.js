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

var HardwareRegisters = function(psx)
{
	this.psx = psx;
	
	this.unknownReads = {};
	this.unknownWrites = {};
	
	this.counters = new Counters(psx);
	
	this.u8 = {length: 0x2000};
	this.u16 = {length: 0x2000 >> 1};
	this.u32 = {length: 0x2000 >> 2};
	
	var devices = Array.prototype.slice.call(arguments, 1);
	devices.push(this.counters);
	this._attachDevices.apply(this, devices);
}

HardwareRegisters.prototype.setIrq = function(irq)
{
	this.u32[0x70 >> 2] |= irq;
}

HardwareRegisters.prototype.update = function()
{
	if (this.psx.cpu.cycles - this.counters.assumedStart >= this.counters.nextTarget)
		this.counters.update();
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
	
	// TODO attacher sur les u8
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
	
	// TODO attacher sur les u8
}

HardwareRegisters.unimplementedRegistersList = [
	0x1f801000, 0x1f801004, 0x1f801008, 0x1f80100c, 0x1f801010, 0x1f80101c,
	0x1f802041, 0x1f801018, 0x1f8016c0, 0x1f8016c2,
	
	// interrupts (those don't need special handling)
	0x1f801070, 0x1f801074,
	
	// DMA stuff
	0x1f8010f0, 0x1f8010f4
];

HardwareRegisters.unimplementedRegisters = {};

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
		var address = 0x1F801000 + index;
		return function()
		{
			if (!(address in HardwareRegisters.unimplementedRegisters))
			{
				self.unknownReads[address] = true;
				self.psx.diags.warn("reading register %x", address);
			}
			return buffer[index >>> shift];
		};
	}
	
	function undef_setter(buffer, index, shift)
	{
		var address = 0x1F801000 + index;
		return function(value)
		{
			if (!(address in HardwareRegisters.unimplementedRegisters))
			{
				self.unknownWrites[address] = true;
				self.psx.diags.warn("writing register %x -> %x", address, value);
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

;(function()
{
	for (var i = 0; i < HardwareRegisters.unimplementedRegistersList.length; i++)
	{
		var key = HardwareRegisters.unimplementedRegistersList[i];
		HardwareRegisters.unimplementedRegisters[key] = true;
	}
});
