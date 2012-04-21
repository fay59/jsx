var BreakpointList = function(cpu)
{
	this.cpu = cpu;
	this.list = {};
}

BreakpointList.prototype.hit = function(address)
{
	if (address in this.list)
		this.list[address].hit();
}

BreakpointList.prototype.hasEnabledBreakpoint = function(address)
{
	return address in this.list;
}

BreakpointList.prototype.getBreakpoint = function(address)
{
	return this.list[address];
}

BreakpointList.prototype.setBreakpoint = function(address)
{
	this.list[address] = new Breakpoint(address);
	this.cpu.invalidate(address);
	return this.list[address];
}

BreakpointList.prototype.removeBreakpoint = function(address)
{
	if (address in this.list)
	{
		delete this.list[address];
		this.cpu.invalidate(address);
	}
}

BreakpointList.prototype.toggleBreakpoint = function(address)
{
	if (this.hasEnabledBreakpoint(address))
		this.removeBreakpoint(address);
	else
		this.setBreakpoint(address);
}

var Breakpoint = function(address, skipHits)
{
	this.address = address;
	this.skipHits = isFinite(skipHits) ? skipHits : 0;
	this.hitCount = 0;
	this.enabled = true;
}

Breakpoint.prototype.hit = function()
{
	if (!this.enabled) return;
	
	this.hitCount++;
	if (this.hitCount > this.skipHits)
		throw new Breakpoint.Hit(this);
}

Breakpoint.prototype.toString = function()
{
	return "breakpoint at address 0x" + Recompiler.formatHex(this.address);
}

Breakpoint.Hit = function(breakpoint)
{
	this.breakpoint = breakpoint;
}

Breakpoint.Hit.prototype.toString = function()
{
	return this.breakpoint.toString();
}