var GPU = function(psx, glContext)
{
	this.psx = psx;
	this.gl = glContext;
	this.status = 0;
	this.reset();
}

GPU.prototype.install = function(hwregs)
{
	var self = this;
	hwregs.wire(0x1f801814,
		function() { return self.status; },
		function(value) { self.processCommand(value); }
	);
}

GPU.prototype.reset = function()
{
	this.status = 0x14802000;
}

GPU.prototype.processCommand = function(data)
{
	var command = (data >>> 24) & 0xff;
	switch (command)
	{
		case 0x00: // reset
			break;
		
		case 0x03: // enable/disable display
			break;
		
		case 0x04: // set transfer mode
			break;
		
		case 0x05: // set display portion
			break;
		
		case 0x06: // set width
			break;
		
		case 0x07: // set height
			break;
		
		case 0x08: // set display infos
			break;
		
		case 0x10: // get GPU infos
			break;
		
		default:
			this.psx.diags.log("unknown command " + command.toString(16));
			break;
	}
}