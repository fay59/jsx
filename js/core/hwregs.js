var HardwareRegisters = function()
{
	this.backbuffer = new ArrayBuffer(0x2000);
	
	var u8 = new Uint8Array(this.backbuffer);
	var u16 = new Uint16Array(this.backbuffer);
	var u32 = new Uint32Array(this.backbuffer);
	
	this.u8 = {};
	this.u16 = {};
	this.u32 = {};
	
	function getter(buffer, index, shift)
	{
		return function()
		{
			var address = (0x1F801000 + index).toString(16);
			console.warn("reading register " + address);
			return buffer[index >>> shift];
		};
	}
	
	function setter(buffer, index, shift)
	{
		return function(value)
		{
			var address = (0x1F801000 + index).toString(16);
			console.warn("writing register " + address + " -> " + value.toString(16));
			buffer[index >>> shift] = value;
		};
	}
	
	for (var i = 0; i < 0x2000; i++)
	{
		if (i % 4 == 0)
		{
			this.u32.__defineGetter__(i, getter(u32, i, 2));
			this.u32.__defineSetter__(i, setter(u32, i, 2));
		}
		
		if (i % 2 == 0)
		{
			this.u16.__defineGetter__(i, getter(u16, i, 1));
			this.u16.__defineSetter__(i, setter(u16, i, 1));
		}
				
		this.u8.__defineGetter__(i, getter(u8, i, 0));
		this.u8.__defineSetter__(i, setter(u8, i, 0));
	}
}