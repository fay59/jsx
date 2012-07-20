var BreakpointTable = function(tbody, breakpointList)
{
	this.tbody = tbody;
	this.breakpointList = breakpointList;
	this.breakpointRows = {};
	
	this._added = this._breakpointAdded.bind(this);
	this._removed = this._breakpointRemoved.bind(this);
	
	if (breakpointList != undefined)
		this.reset(breakpointList);
}

BreakpointTable.prototype.reset = function(breakpointList)
{
	if (this.breakpointList != undefined)
	{
		for (var address in this.breakpointList.list)
		{
			var bp = this.breakpointList[address];
			this._breakpointRemoved({breakpoint: bp});
		}
		
		this.breakpointList.removeEventListener("addedbreakpoint", this._added);
		this.breakpointList.removeEventListener("removedbreakpoint", this._removed);
	}
	
	for (var address in breakpointList.list)
	{
		var bp = breakpointList[address];
		this._breakpointAdded({breakpoint: bp});
	}
	
	this.breakpointList = breakpointList;
	this.breakpointList.addEventListener("addedbreakpoint", this._added);
	this.breakpointList.addEventListener("removedbreakpoint", this._removed);
}

BreakpointTable.prototype._breakpointRemoved = function(event)
{
	var breakpoint = event.breakpoint;
	this.tbody.removeChild(this.breakpointRows[breakpoint.address]);
	delete this.breakpointRows[breakpoint.address];
}

BreakpointTable.prototype._breakpointAdded = function(event)
{
	var breakpoint = event.breakpoint;
	
	function bindProperty(breakpointProperty, elementProperty)
	{
		return function()
		{
			breakpoint[breakpointProperty] = this[elementProperty];
		}
	}
	
	var self = this;
	var tr = document.createElement("tr");
	
	var removeTd = document.createElement("td");
	removeTd.textContent = "x";
	removeTd.addEventListener("click", function()
	{
		self.breakpointList.removeBreakpoint(breakpoint.address);
	});
	
	var enableTd = document.createElement("td");
	var enable = document.createElement("input");
	enable.type = "checkbox";
	enable.checked = breakpoint.enabled;
	enable.addEventListener("change", bindProperty("enabled", "enabled"));
	enableTd.appendChild(enable);
	
	var ignoreTd = document.createElement("td");
	var ignore = document.createElement("input");
	ignore.type = "text";
	ignore.size = 2;
	ignore.value = breakpoint.skipHits;
	ignore.addEventListener("change", bindProperty("skipHits", "value"));
	ignoreTd.appendChild(ignore);
	
	var hitCountTd = document.createElement("td");
	hitCountTd.textContent = breakpoint.hitCount;
	breakpoint.addEventListener("hit", function()
	{
		hitCountTd.textContent = breakpoint.hitCount;
	});
	
	var addressTd = document.createElement("td");
	addressTd.textContent = Recompiler.formatHex(breakpoint.address);
	
	tr.appendChild(removeTd);
	tr.appendChild(enableTd);
	tr.appendChild(ignoreTd);
	tr.appendChild(hitCountTd);
	tr.appendChild(addressTd);
	this.breakpointRows[breakpoint.address] = tr;
	this.tbody.appendChild(tr);
}
