var StateComparator = function(buffer)
{
	this.frameIndex = 0;
	this.buffer = buffer;
}

StateComparator.ComparisonError = function(error)
{
	this.message = error;
}

StateComparator.ComparisonError.prototype.toString = function()
{
	return "state comparison error: " + this.message;
}

StateComparator.prototype.reset = function(memory)
{
	var recompiler = memory.compiled.recompiler;
	var delaySlot = 0;
	
	function compare(address)
	{
		return "context.compare(0x" + address.toString(16) + ", this);";
	}
	
	recompiler.addInjector({
		injectBeforeInstruction: function(address, opcode, isDelaySlot)
		{
			if (isDelaySlot)
			{
				delaySlot = 2;
				return;
			}
			
			if (delaySlot == 2)
			{
				delaySlot--;
				return compare(address) + "\ntry {\n";
			}
			
			return compare(address) + "\n";
		},
		
		injectAfterInstruction: function(address, opcode, isDelaySlot)
		{
			if (delaySlot == 1)
			{
				delaySlot--;
				return "} finally { " + compare(address + 4) + "}\n";
			}
		}
	});
}

StateComparator.prototype.compare = function(pc, cpu)
{
	try
	{
		var array = new Uint32Array(this.buffer, this.frameIndex * 0x10, 4);
		if (pc != array[0])
			throw new StateComparator.ComparisonError("program counter does not match after " + this.frameIndex + " instructions");
		
		var changeIndex = array[2];
		var changeValue = array[3];
		if (cpu.gpr[changeIndex] != changeValue)
		{
			var message = "at " + pc.toString(16) + ": ";
			message += "register " + changeIndex + " should be " + changeValue.toString(16) + " ";
			message += "but it's " + cpu.gpr[changeIndex].toString(16);
			throw new StateComparator.ComparisonError(message);
		}
	}
	finally
	{
		this.frameIndex++;
	}
}