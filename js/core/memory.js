var MemoryMap = function(biosBuffer)
{
	this.diags = console;
	
	var allocationSize = 0;
	for (var key in MemoryMap.regions)
		allocationSize += MemoryMap.regions[key];
	
	this.backbuffer = new ArrayBuffer(allocationSize);
	this.invalidAddress = this.backbuffer.byteLength;
	
	this.u8 = new Uint8Array(this.backbuffer);
	this.u16 = new Uint16Array(this.backbuffer);
	this.u32 = new Uint32Array(this.backbuffer);
	
	if (biosBuffer !== undefined)
	{
		var bios32Offset = MemoryMap.offsets.bios >>> 2;
		var biosArray = new Uint32Array(biosBuffer);
		for (var i = 0; i < biosArray.length; i++)
			this.u32[bios32Offset + i] = biosArray[i];
	}
}

MemoryMap.regions = {
	kernelRAM: 0x1000,
	userRAM: 0x1F000,
	parallelPort: 0x10000,
	scratch: 0x400,
	registers: 0x2000,
	bios: 0x80000
};

MemoryMap.offsets = {};

MemoryMap.prototype.translate = function(address)
{
	if (address === undefined)
		throw new Error("undefined address");
	
	address &= 0x1FFFFFFF;
	if (address < 0x200000)
		return address;
	
	if (address < 0x1F000000)
	{
		this.diags.warn("accessing unmapped memory address " + address.toString(16));
		return this.backbuffer.byteLength;
	}
	
	if (address < 0x1F01000)
		return address - 0x1F000000 + MemoryMap.offsets.parallelPort;
	
	if (address < 0x1F800000)
	{
		this.diags.warn("accessing unmapped memory address " + address.toString(16));
		return this.backbuffer.byteLength;
	}
	
	if (address < 0x1F800400)
		return address - 0x1F800000 + MemoryMap.offsets.scratch;
	
	if (address < 0x1F801000)
	{
		this.diags.warn("accessing unmapped memory address " + address.toString(16));
		return this.backbuffer.byteLength;
	}
	
	if (address < 0x1F803000)
	{
		this.diags.warn("accessing hardware register at " + address.toString(16));
		return address - 0x1F801000 + MemoryMap.offsets.registers;
	}
	
	if (address < 0x1FC00000)
	{
		this.diags.warn("accessing unmapped memory address " + address.toString(16));
		return this.backbuffer.byteLength;
	}
	
	if (address < 0x1FC80000)
		return address - 0x1FC00000 + MemoryMap.offsets.bios;
	
	this.diags.warn("accessing unmapped memory address " + address.toString(16));
	return this.backbuffer.byteLength;
}

MemoryMap.prototype.read8 = function(address)
{
	return this.u8[this.translate(address)];
}
		
MemoryMap.prototype.write8 = function(address, value)
{
	this.u8[this.translate(address)] = value;
};

// see below for the other read/write functions

(function()
{
	var endianTestBuffer = new ArrayBuffer(2);
	var u8 = new Uint8Array(endianTestBuffer);
	var u16 = new Uint16Array(endianTestBuffer);
	
	u16[0] = 0xDEAD;
	if (u8[0] == 0xDE)
	{
		// big-endian; shit
		MemoryMap.endianness = "big";
		
		function swap16(x)
		{
			return ((x & 0xFF) << 8) | (x >>> 8);
		}
		
		function swap32(x)
		{
			return ((x & 0xff) << 24)
				  | ((x & 0xff00) << 8)
				  | ((x & 0xff0000) >>> 8)
				  | (x >>> 24);
		}
		
		MemoryMap.prototype.read16 = function(address)
		{
			var translated = this.translate(address) >>> 1;
			return swap16(this.u16[translated]);
		}
		
		MemoryMap.prototype.read32 = function(address)
		{
			var translated = this.translate(address) >>> 2;
			return swap32(this.u32[translated]);
		}
		
		MemoryMap.prototype.write16 = function(address, value)
		{
			var translated = this.translate(address) >>> 1;
			this.u16[translated] = swap16(value);
		}
		
		MemoryMap.prototype.write32 = function(address, value)
		{
			var translated = this.translate(address) >>> 2;
			this.u32[translated] = swap32(value);
		}
	}
	else
	{
		// little-endian; praise the lord!
		MemoryMap.endianness = "little";
		
		MemoryMap.prototype.read16 = function(address)
		{
			return this.u16[this.translate(address) >>> 1];
		}
		
		MemoryMap.prototype.read32 = function(address)
		{
			return this.u32[this.translate(address) >>> 2];
		}
		
		MemoryMap.prototype.write16 = function(address, value)
		{
			this.u16[this.translate(address) >>> 1] = value;
		}
		
		MemoryMap.prototype.write32 = function(address, value)
		{
			this.u32[this.translate(address) >>> 2] = value;
		}
	}
	
	var offset = 0;
	for (var key in MemoryMap.regions)
	{
		MemoryMap.offsets[key] = offset;
		offset += MemoryMap.regions[key];
	}
})();