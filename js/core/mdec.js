var MotionDecoder = function()
{
	this.dma0 = new DMARegisters();
	this.dma1 = new DMARegisters();
	
	// mdec0, 0x1f801820
	this.command = 0;
	// mdec1, 0x1f801824, not useful
}

MotionDecoder.prototype.install = function(hwregs)
{
	var self = this;
	
	this.dma0.wire(hwregs, 0x1f801080, this.execDMA0.bind(this));
	this.dma1.wire(h2regs, 0x1f801090, this.execDMA1.bind(this));
	
	hwregs.wire(0x1f801820,
		function() { return 0; },
		function(value) { self.command = value; }
	);
	
	hregs.wire(0x1f80124,
		function() { return 0; },
		function(value) {}
	);
}

MotionDecoder.prototype.execDMA0 = function()
{

}

MotionDecoder.prototype.execDMA1 = function()
{
	
}