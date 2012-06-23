var ContinuousStateComparator = function(buffer)
{
	this.instructions = 0;
	this.arrayStart = 0;
	this.buffer = buffer;
	this.hits = {};
}

ContinuousStateComparator.ComparisonError = function(error)
{
	this.message = error;
}

ContinuousStateComparator.ComparisonError.prototype.toString = function()
{
	return "state comparison error: " + this.message;
}

ContinuousStateComparator.prototype.reset = function(memory)
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

ContinuousStateComparator.prototype.compare = function(pc, cpu)
{
	// pc, changes, gprValue, cop0Values[4]
	if (this.hits[pc] === undefined) this.hits[pc] = 0;
	this.hits[pc]++;
	
	var maxSize = (this.buffer.byteLength - this.arrayStart) >>> 2;
	if (maxSize == 0)
		throw new Error("passed through all recorded state");
	var array = new Uint32Array(this.buffer, this.arrayStart, Math.min(maxSize, 7));
	
	var pcsxPC = array[0];
	var changedGPR = array[1] & 0x1f;
	var gprValue = array[2];
	var changedCOP0 = {};
	
	var j = 0;
	var cop0 = array[1] >>> 9;
	for (var i = 0; cop0 != 0; i++)
	{
		if (cop0 & 1)
		{
			changedCOP0[i] = array[3 + j];
			j++;
		}
		cop0 >>>= 1;
	}
	
	this.arrayStart += (3 + j) * 4;
	this.instructions++;
	
	if (pc != pcsxPC)
	{
		var message = "program counter does not match after ";
		message += this.instructions + " instructions ";
		message += "(after " + this.hits[pc] + " hits)";
		throw new ContinuousStateComparator.ComparisonError(message);
	}
	
	if (cpu.gpr[changedGPR] != gprValue)
	{
		var message = "at " + pc.toString(16) + " after " + this.instructions + " instructions: ";
		message += "GRP " + changedGPR + " should be " + gprValue.toString(16) + " ";
		message += "but it's " + cpu.gpr[changedGPR].toString(16) + " ";
		message += "(after " + this.hits[pc] + " hits)";
		throw new ContinuousStateComparator.ComparisonError(message);
	}
	
	for (var key in changedCOP0)
	{
		if (cpu.cop0_reg[key] != changedCOP0[key])
		{
			var changeValue = changedCOP0[key];
			var message = "at " + pc.toString(16) + " after " + this.instructions + " instructions: ";
			message += "COP0 register " + key + " should be " + changeValue.toString(16) + " ";
			message += "but it's " + cpu.cop0_reg[key].toString(16) + " ";
			message += "(after " + this.hits[pc] + " hits)";
			throw new ContinuousStateComparator.ComparisonError(message);
		}
	}
}