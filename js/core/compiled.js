var FunctionCache = function()
{
	this.reset();
}

FunctionCache.prototype.reset = function()
{
	this.compiled = {};
	this.invalidationMap = new Uint32Array(0x200000);
}

FunctionCache.prototype.functionExists = function(address)
{
	return address in this.compiled;
}

FunctionCache.prototype.getFunction = function(address)
{
	return this.compiled[address];
}

FunctionCache.prototype.saveFunction = function(address, fn)
{
	this.compiled[address] = fn;
}

FunctionCache.property.invoke = function(cpu, address, context)
{
	if (!this.functionExists(address))
		throw new Error("Trying to execute unexistant function");
	
	this.compiled[address].code.call(cpu, context);
}

FunctionCache.prototype.invalidate = function(address)
{
	// TODO speed me up!
	var keysToRemove = [];
	
allFunctions:
	for (var key in this.compiled)
	{
		var fn = this.compiled[key];
		for (var i = 0; i < fn.ranges.length; i++)
		{
			var range = fn.ranges[i];
			if (address >= range[0] && address <= range[1])
			{
				keysToRemove.push(key);
				continue allFunctions;
			}
		}
	}
	
	for (var i = 0; i < keysToRemove.length; i++)
		delete this.compiled[keysToRemove[i]];
}

FunctionCache.prototype.invalidateRange = function(start, size)
{
	// TODO speed me up!
	var keysToRemove = [];
	var end = start + size;
	
allFunctions:
	for (var key in this.compiled)
	{
		var fn = this.compiled[key];
		for (var i = 0; i < fn.ranges.length; i++)
		{
			var range = fn.ranges[i];
			if (FunctionCache.rangeOverlaps(start, end, range[0], range[1])
			 || FunctionCache.rangeOverlaps(range[0], range[1], start, end))
			{
				keysToRemove.push(key);
				continue allFunctions;
			}
		}
	}
	
	for (var i = 0; i < keysToRemove.length; i++)
		delete this.compiled[keysToRemove[i]];
}

FunctionCache.rangeOverlaps = function(s1, e1, s2, e2)
{
	return (s1 >= s2 && s1 <= e2)
		|| (e1 >= s2 && e1 <= e2);
}
