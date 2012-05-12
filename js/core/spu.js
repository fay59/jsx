var SPU = function(psx, audio)
{
	this.psx = psx;
	this.audio = audio;
}

SPU.prototype.install = function(hwregs)
{
	var noop = function() {}
	var self = this;
	
	// voices
	for (var i = 0; i < 0x18; i++)
	{
		var baseAddress = 0x1f801c00 + (i << 4);
		for (var j = 0; j < 6; j++)
			hwregs.wire16(baseAddress + (j << 1), noop, noop);
	}
	
	// control registers
	for (var i = 0x1f801d80; i < 0x1f801da0; i += 2)
		hwregs.wire16(i, noop, noop);
}

SPU.prototype.reset = function()
{
	
}