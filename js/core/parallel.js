var ParallelPortMemoryRange = function(psx)
{
	this.u8 = {};
	this.u16 = {};
	this.u32 = {};
	
	const baseLength = 0x100;
	var getZero = function() { return 0; };
	for (var i = 0; i < baseLength; i++)
	{
		if (i % 4 == 0)
			this.u32.__defineGetter__(i >>> 2, getZero);
		
		if (i % 2 == 0)
			this.u16.__defineGetter__(i >>> 1, getZero);
		
		this.u8.__defineGetter__(i, getZero);
	}
	
	for (var i = baseLength; i < 0x10000; i++)
	{
		if (i % 4 == 0)
			this.u32.__defineGetter__(i >>> 2, function() { return 0xFFFFFFFF; });
		
		if (i % 2 == 0)
			this.u16.__defineGetter__(i >>> 1, function() { return 0xFFFF; });
				
		this.u8.__defineGetter__(i, function() { return 0xFF; });
	}
	
	function accessError(addr)
	{
		return function()
		{
			psx.diags.warn("writing to parallel port range at 0x%08x", addr);
		}
	}
	
	for (var i = 0; i < 0x10000; i++)
	{
		if (i % 4 == 0)
			this.u32.__defineSetter__(i >>> 2, accessError(i));
		if (i % 2 == 0)
			this.u16.__defineSetter__(i >>> 1, accessError(i));
		this.u8.__defineSetter__(i, accessError(i));
	}
	
	this.u8.length = 0x10000;
	this.u16.length = 0x10000 >>> 1;
	this.u32.length = 0x10000 >>> 2;
};
