var BranchComparator = function(buffer)
{
	this.branches = 0;
	this.arrayStart = 0;
	this.buffer = buffer;
}

BranchComparator.ComparisonError = function(error)
{
	this.message = error;
}

BranchComparator.ComparisonError.prototype.toString = function()
{
	return "state comparison error: " + this.message;
}

BranchComparator.prototype.reset = function(memory)
{
	var recompiler = memory.compiled.recompiler;
	
	function compare(address)
	{
		return "context.compare(0x" + address.toString(16) + ", this);";
	}
	
	recompiler.addInjector({
		injectBeforeBranch: function()
		{
			return "context.compare(pc, this);";
		}
	});
}

BranchComparator.prototype.compare = function(pc, cpu)
{
	// order:
	// pc, gprChanges, cop0Changes, gpr, cop0
	
	var maxSize = (this.buffer.byteLength - this.arrayStart) >>> 2;
	if (maxSize == 0)
		throw new Error("passed through all recorded state");
	
	var array = new Uint32Array(this.buffer, this.arrayStart, Math.min(maxSize, 51));
	
	function bitfieldToArray(bitfield)
	{
		var result = [];
		for (var i = 0; i < 32; i++)
		{
			if (bitfield & (1 << i))
				result.push(i);
		}
		return result;
	}
	
	var pcsxPC = array[0];
	var changedGPR = bitfieldToArray(array[1]);
	var changedCOP0 = bitfieldToArray(array[2]);
	this.branches++;
	
	if (pc != pcsxPC)
	{
		var message = "program counter does not match after ";
		message += this.instructions + " instructions ";
		message += "(after " + this.hits[pc] + " hits)";
		throw new ContinuousStateComparator.ComparisonError(message);
	}
	
	for (var i = 0; i < changedGPR.length; i++)
	{
		var index = changedGPR[i];
		var pcsxValue = array[3 + index];
		var gprValue = cpu.gpr[index];
		if (pcsxValue != gprValue)
		{
			var message = "at " + pc.toString(16) + " after " + this.branches + " branchings: ";
			message += "GRP " + index + " should be " + pcsxValue.toString(16) + " ";
			message += "but it's " + gprValue.toString(16);
			throw new BranchComparator.ComparisonError(message);
		}
	}
	
	for (var i = 0; i < changedCOP0.length; i++)
	{
		var index = changedCOP0[i];
		var pcsxValue = array[3 + changedGPR.length + i];
		var cop0Value = cpu.cop0_reg[index];
		var message = "at " + pc.toString(16) + " after " + this.branches + " branchings: ";
		message += "COP0 register " + key + " should be " + changeValue.toString(16) + " ";
		message += "but it's " + cpu.cop0_reg[key].toString(16);
		throw new ContinuousStateComparator.ComparisonError(message);
	}
}