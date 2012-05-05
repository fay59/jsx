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

var Counter = function()
{
	this.count = 0;
	this.target = 0;
	this.mode = 0;
	
	this.startCycle = 0;
	this.cycle = 0;
	this.rate = 0;
	this.interrupt = 0;
}

Counter.prototype.wire = function(hwregs, address)
{
	var self = this;
	hwregs.wire(address,
		function() { return this.count; },
		function(value) {  }
	);
	
	hwregs.wire(address + 4,
		function() { return this.mode; },
		function(value) {  }
	);
	
	hwregs.wire(address + 4,
		function() { return this.target; },
		function(value) {  }
	);
}

var HardwareRegisters = function(psx)
{
	this.psx = psx;
	
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
			if (this.notifyUnknowns && HardwareRegisters.unimplementedRegisters.indexOf(address) == -1)
				self.psx.diags.warn("reading register " + strAddress);
			return buffer[index >>> shift];
		};
	}
	
	function undef_setter(buffer, index, shift)
	{
		return function(value)
		{
			var address = 0x1F801000 + index;
			var strAddress = address.toString(16);
			if (this.notifyUnknowns && HardwareRegisters.unimplementedRegisters.indexOf(address) == -1)
				self.psx.diags.warn("writing register " + strAddress + " -> " + value.toString(16));
			buffer[index >>> shift] = value;
		};
	}
	
	this.notifyUnknowns = true;
	this.backbuffer = new ArrayBuffer(0x2000);
	
	var u8 = new Uint8Array(this.backbuffer);
	var u16 = new Uint16Array(this.backbuffer);
	var u32 = new Uint32Array(this.backbuffer);
	
	this.u8 = {length: 0x2000};
	this.u16 = {length: 0x2000 >> 1};
	this.u32 = {length: 0x2000 >> 2};
	
	for (var i = 1; i < arguments.length; i++)
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

HardwareRegisters.unimplementedRegisters = [
	0x1f801000, 0x1f801004, 0x1f801008, 0x1f80100c, 0x1f801010, 0x1f80101c,
	0x1f802041, 0x1f801018, 0x1f8016c0, 0x1f8016c2,
	
	// SPU
	0x1f801da6, 0x1f801da8, 0x1f801daa, 0x1f801dac, 0x1f801dae
];

HardwareRegisters.prototype.wire = function(address, getter, setter)
{
	if (!isFinite(address) || address < 0x1F801000)
		throw new Error("address is not finite or too small");
	
	address -= 0x1F801000;
	this.u32.__defineGetter__(address >>> 2, getter);
	this.u32.__defineSetter__(address >>> 2, setter);
	
	this.u16.__defineGetter__(address >>> 1, function() { return getter() & 0xffff; });
	this.u16.__defineGetter__((address >>> 1) + 1, function() { return getter() >>> 16; });
	this.u16.__defineSetter__(address >>> 1, function(value) { setter((getter() & 0xffff0000) | value); });
	this.u16.__defineSetter__((address >>> 1) + 1, function(value) { setter((getter() & 0xffff) | (value << 16)); });
}
