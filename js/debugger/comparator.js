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
	recompiler.addInjector({
		injectBeforeInstruction: function(address, opcode)
		{
			return "context.compare(" + address + ", this);\n";
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
			throw new StateComparator.ComparisonError("register " + changeIndex + " should be " + changeValue.toString(16));
	}
	finally
	{
		this.frameIndex++;
	}
}