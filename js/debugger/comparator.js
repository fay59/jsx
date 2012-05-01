var StateComparator = function(buffer)
{
	this.frameIndex = 0;
	this.buffer = buffer;
	this.hits = {};
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
	var isJump = false;
	
	function compare(address)
	{
		return "context.compare(0x" + address.toString(16) + ", this);";
	}
	
	recompiler.addInjector({
		injectBeforeInstruction: function(address, opcode, isDelaySlot)
		{
			if (opcode.instruction.name[0] == 'j')
			{
				isJump = true;
				return "try {\n";
			}
			
			if (isDelaySlot && isJump)
			{
				return compare(address - 4) + "\n";
			}
			
			return compare(address) + "\n";
		},
		
		injectAfterInstruction: function(address, opcode, isDelaySlot)
		{
			if (!isDelaySlot && isJump)
			{
				isJump = false;
				return "} finally { " + compare(address + 4) + "}\n";
			}
		}
	});
}

StateComparator.prototype.compare = function(pc, cpu)
{
	try
	{
		if (this.hits[pc] === undefined) this.hits[pc] = 0;
		this.hits[pc]++;
		
		var array = new Uint32Array(this.buffer, this.frameIndex * 0x10, 4);
		if (pc != array[0])
		{
			var message = "program counter does not match after ";
			message += this.frameIndex + " instructions ";
			message += "(after " + this.hits[pc] + " hits)";
			throw new StateComparator.ComparisonError(message);
		}
		
		var changeIndex = array[2];
		var changeValue = array[3];
		if (cpu.gpr[changeIndex] != changeValue)
		{
			var message = "at " + pc.toString(16) + ": ";
			message += "register " + changeIndex + " should be " + changeValue.toString(16) + " ";
			message += "but it's " + cpu.gpr[changeIndex].toString(16) + " ";
			message += "(after " + this.hits[pc] + " hits)";
			throw new StateComparator.ComparisonError(message);
		}
	}
	finally
	{
		this.frameIndex++;
	}
}