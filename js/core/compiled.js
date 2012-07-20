var FunctionCache = function(memory)
{
	this.reset(memory);
}

FunctionCache.prototype.reset = function(memory)
{
	this.invalidationMap = new Uint32Array(0x200000 >>> 8);
	this.callCount = 0;
	this.recompiler = new Recompiler();
	this.memory = memory;
	this.compiled = {};
}

FunctionCache.prototype.functionExists = function(address)
{
	return address in this.compiled;
}

FunctionCache.prototype.functionDirty = function(address)
{
	var fn = this.compiled[address];
	for (var i = 0; i < fn.ranges.length; i++)
	{
		var range = fn.ranges[i];
		for (var j = range[0]; j < range[1]; j += 0x100)
		{
			if (this.invalidationMap[j >>> 8] > fn.jitTime)
			{
				return true;
			}
		}
	}
	return false;
}

FunctionCache.prototype.getFunction = function(address)
{
	return this.compiled[address];
}

FunctionCache.prototype.saveFunction = function(fn)
{
	fn.jitTime = this.callCount;
	for (var i = 0; i < fn.labels.length; i++)
	{
		var label = fn.labels[i];
		this.compiled[label] = fn;
	}
}

FunctionCache.prototype.invalidate = function(address)
{
	this.invalidationMap[(address & 0x1fffffff) >>> 8] = this.callCount;
}

FunctionCache.prototype.invalidateRange = function(start, size)
{
	address &= 0x1fffffff;
	for (var i = 0; i < size; i += 0x100)
		this.invalidationMap[(start + i) >>> 8] = this.callCount;
}

FunctionCache.prototype.invoke = function(cpu, address, context)
{
	if (!this.functionExists(address) || this.functionDirty(address))
	{
		try
		{
			var compiled = this.recompiler.recompileFunction(this.memory, address, context);
			this.saveFunction(compiled);
		}
		catch (e)
		{
			throw new ExecutionException("A recompilation exception prevented the program from continuing", address, e);
		}
	}
	
	this.callCount++;
	return this.compiled[address].code.call(cpu, address, context);
}

FunctionCache.prototype.executeOne = function(cpu, address, context)
{
	var func = this.recompiler.recompileOne(this.memory, address, context);
	return func.call(cpu, context);
}
