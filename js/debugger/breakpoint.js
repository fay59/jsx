var BreakpointList = function(cpu)
{
	this.cpu = cpu;
	this.list = {};
	this.eventListeners = {
		"addedbreakpoint": [],
		"removedbreakpoint": []
	};
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

BreakpointList.prototype.resetHits = function()
{
	for (var key in this.list)
		this.list[key].setHits(0);
}

BreakpointList.prototype.getBreakpoint = function(address)
{
	return this.list[address];
}

BreakpointList.prototype.setBreakpoint = function(address)
{
	this.removeBreakpoint(address);
	
	this.list[address] = new Breakpoint(address);
	this.cpu.invalidate(address);
	this._eventCallback("addedbreakpoint", {breakpoint: this.list[address]});
	
	return this.list[address];
}

BreakpointList.prototype.removeBreakpoint = function(address)
{
	if (address in this.list)
	{
		var breakpoint = this.list[address];
		delete this.list[address];
		this.cpu.invalidate(address);
		this._eventCallback("removedbreakpoint", {breakpoint: breakpoint});
	}
}

BreakpointList.prototype.toggleBreakpoint = function(address)
{
	if (this.hasEnabledBreakpoint(address))
		this.removeBreakpoint(address);
	else
		this.setBreakpoint(address);
}

BreakpointList.prototype.addEventListener = function(event, listener)
{
	if (!(event in this.eventListeners))
		return false;
	
	this.eventListeners[event].push(listener);
	return true;
}

BreakpointList.prototype.removeEventListener = function(event, listener)
{
	if (!(event in this.eventListeners))
		return false;
	
	var index = this.eventListeners[event].indexOf(listener);
	if (index == -1)
		return false;
	
	this.eventListeners.splice(index, 1);
	return true;
}

BreakpointList.prototype._eventCallback = function(fn)
{
	var eventParams = Array.prototype.slice.call(arguments, 1);
	for (var i = 0; i < this.eventListeners[fn].length; i++)
		this.eventListeners[fn][i].apply(this, eventParams);
}

var Breakpoint = function(address, skipHits)
{
	this.address = address;
	this.skipHits = isFinite(skipHits) ? skipHits : 0;
	this.hitCount = 0;
	this.enabled = true;
	this._skipOnce = false;
	
	this.hitListeners = [];
}

Breakpoint.prototype.hit = function()
{
	if (!this.enabled) return;
	
	if (this._skipOnce)
	{
		this._skipOnce = false;
		return;
	}
	
	this.setHits(this.hitCount + 1);
	if (this.hitCount > this.skipHits)
		throw new Breakpoint.Hit(this);
}

Breakpoint.prototype.addEventListener = function(event, listener)
{
	if (event != "hit")
		return false;
	
	this.hitListeners.push(listener);
	return true;
}

Breakpoint.prototype.removeEventListener = function(event, listener)
{
	if (event != "hit")
		return false;
	
	var index = this.hitListeners.indexOf(listener);
	if (index == -1)
		return false;
	
	this.hitListeners.splice(index, 1);
	return true;
}

Breakpoint.prototype.setHits = function(hits)
{
	this.hitCount = hits;
	for (var i = 0; i < this.hitListeners.length; i++)
		this.hitListeners[i].call(this);
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