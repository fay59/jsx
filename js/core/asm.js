var Assembler = {}

Assembler.parse = {};

Assembler.registerNames = {};
Assembler.cop0RegisterNames = {};

Assembler.toPaddedBinary = function(x, length)
{
	var mask = (1 << length) - 1;
	var output = (x & mask).toString(2);
	while (output.length < length)
		output = '0' + output;
	return output;
}

Assembler.intifyValue = function(x, group)
{
	switch (group)
	{
	case 'd':
	case 's':
	case 't':
		return Assembler.registerNames[x];
	
	case 'l':
		return Assembler.cop0RegisterNames[x];
	
	case 'i<<2':
		return parseInt(x, 16) >>> 2;
	
	case 'i':
	case 'o':
		return parseInt(x, 16);
	
	default:
		throw new Error("can't assemble group type " + group);
	}
}

Assembler.assembleOne = function(line)
{
	for (var operation in Assembler.parse)
	{
		var parsing = Assembler.parse[operation];
		var matches = line.match(parsing.regex);
		if (matches)
		{
			var writeValues = {};
			for (var j = 0; j < parsing.groups.length; j++)
			{
				var group = parsing.groups[j];
				var match = matches[j + 1];
				writeValues[group[0]] = Assembler.intifyValue(match, group);
			}
			
			var binary = parsing.pattern;
			for (var key in writeValues)
			{
				var fieldLength = binary.lastIndexOf(key) - binary.indexOf(key) + 1;
				var replace = new RegExp(key + '+');
				var value = Assembler.toPaddedBinary(writeValues[key], fieldLength);
				binary = binary.replace(replace, value);
			}
			return parseInt(binary, 2);
		}
	}
	return undefined;
}

Assembler.assemble = function(assembly)
{
	var output = [];
	for (var i = 0; i < assembly.length; i++)
	{
		var line = assembly[i];
		var opcode = Assembler.assembleOne(line);
		if (opcode === undefined)
			throw new Error("'" + line + "' doesn't assemble to anything");
		output.push(opcode);
	}
	return output;
};

(function()
{
	// initialize register name map
	for (var i = 0; i < Disassembler.registerNames.length; i++)
	{
		var name = Disassembler.registerNames[i];
		Assembler.registerNames[name] = i;
	}
	
	for (var i = 0; i < Disassembler.cop0RegisterNames.length; i++)
	{
		var name = Disassembler.cop0RegisterNames[i];
		Assembler.cop0RegisterNames[name] = i;
	}
	
	// initialize parsing map
	var grouping = /{(.+?)}/g;
	for (var operation in Disassembler.patternData)
	{
		var pattern = Disassembler.patternData[operation].pattern;
		var format = Disassembler.patternData[operation].format;
		var matches = format.match(grouping);
		var groups = [];
		if (matches != null)
		{
			for (var i = 0; i < matches.length; i++)
				groups.push(matches[i].substr(1, matches[i].length - 2));
		}
		
		var reFormat = format.replace("+", "\\+").replace(grouping, "(.+?)");
		var regex = new RegExp('^' + reFormat + '$');
		
		Assembler.parse[operation] = {
			pattern: pattern.replace(/\s*/g, ''),
			regex: regex,
			groups: groups
		};
	}
})();