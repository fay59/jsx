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

// ignored addresses from "non-standard" mapping locations like kseg2
MemoryMap.ignoredAddresses = {
	0x1ffe0130: "BIO/cache config register", // see doc/fffe0130.txt
};

MemoryMap.writeActions = {
	0x1f801000: function() { /* mystery, ignored */ },
	0x1f801004: function() { /* mystery, ignored */ },
	0x1f801008: function() { /* mystery, ignored */ },
	0x1f80100c: function() { /* mystery, ignored */ },
	0x1f801010: function() { /* mystery, ignored */ },
	0x1f801014: function() { /* spu_delay; mystery, ignored */ },
	0x1f801018: function() { /* dv5_delay; mystery, ignored */ },
	0x1f80101c: function() { /* mystery, ignored */ },
	0x1f801020: function() { /* com_delay; mystery, ignored */ },
	0x1f801060: function() { /* ram_size; mystery, ignored */ },
};

MemoryMap.prototype.isHardwareRegister = function(address)
{
	const startAddress = 0x1F801000;
	const endAddress = startAddress + MemoryMap.regions.registers;
	return address >= startAddress && address < endAddress;
}

MemoryMap.prototype.performHardwareFunctions = function(address, oldValue)
{
	var newValue = this.u32[this.translate(address) >>> 2];
	if (address in MemoryMap.writeActions)
	{
		MemoryMap.writeActions[address].call(this, address, oldValue, newValue);
		return;
	}
	
	var message = "write at address " + address.toString(16)
				+ ": " + oldValue.toString(16)
				+ " -> " + newValue.toString(16);
	console.warn(message);
}

MemoryMap.prototype.translate = function(address)
{
	if (address === undefined)
		throw new Error("undefined address");
	
	var self = this;
	function unmapped()
	{
		if (!(address in MemoryMap.ignoredAddresses))
			self.diags.warn("accessing unmapped memory address " + address.toString(16));
		return self.backbuffer.byteLength;
	}
	
	address &= 0x1FFFFFFF;
	if (address < 0x200000)
		return address;
	
	if (address < 0x1F000000)
		return unmapped();
	
	if (address < 0x1F010000)
		return address - 0x1F000000 + MemoryMap.offsets.parallelPort;
	
	if (address < 0x1F800000)
		return unmapped();
	
	if (address < 0x1F800400)
		return address - 0x1F800000 + MemoryMap.offsets.scratch;
	
	if (address < 0x1F801000)
		return unmapped();
	
	if (address < 0x1F803000)
		return address - 0x1F801000 + MemoryMap.offsets.registers;
	
	if (address < 0x1FC00000)
		return unmapped();
	
	if (address < 0x1FC80000)
		return address - 0x1FC00000 + MemoryMap.offsets.bios;
	
	return unmapped();
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
		
		console.error("JSX does not support big-endian processors at the moment");
	}
	else
	{
		// little-endian; praise the lord!
		MemoryMap.endianness = "little";
		
		MemoryMap.prototype.read8 = function(address)
		{
			return this.u8[this.translate(address)];
		}
		
		MemoryMap.prototype.read16 = function(address)
		{
			return this.u16[this.translate(address) >>> 1];
		}
		
		MemoryMap.prototype.read32 = function(address)
		{
			return this.u32[this.translate(address) >>> 2];
		}
		
		MemoryMap.prototype.write8 = function(address, value)
		{
			var translated = this.translate(address);
			
			var oldWordValue = this.u32[translated >>> 2];
			this.u8[translated] = value;
			
			if (this.isHardwareRegister(address))
				this.performHardwareFunctions(address, oldWordValue);
		}
		
		MemoryMap.prototype.write16 = function(address, value)
		{
			var translated = this.translate(address) >>> 1;
			
			var oldWordValue = this.u32[translated >>> 1];
			this.u16[translated] = value;
			
			if (this.isHardwareRegister(address))
				this.performHardwareFunctions(address, oldWordValue);
		}
		
		MemoryMap.prototype.write32 = function(address, value)
		{
			var translated = this.translate(address) >>> 2;
			
			var oldWordValue = this.u32[translated];
			this.u32[translated] = value;
			
			if (this.isHardwareRegister(address))
				this.performHardwareFunctions(address, oldWordValue);
		}
	}
	
	var offset = 0;
	for (var key in MemoryMap.regions)
	{
		MemoryMap.offsets[key] = offset;
		offset += MemoryMap.regions[key];
	}
})();