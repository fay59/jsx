var DisassemblyTable = function(table)
{
	this.table = table;
	this.fromAddress = 0;
	this.toAddress = 0;
	this.rows = {};
}

DisassemblyTable.prototype.select = function(pc)
{
	for (var key in this.rows)
	{
		var row = this.rows[key];
		row.classList.remove("before");
		row.classList.remove("after");
		
		if (key < pc) row.classList.add("before");
		else if (key > pc) row.classList.add("after");
		else
			this.table.scrollTop = row.offsetTop - 20;
	}
}

DisassemblyTable.prototype.expandTop = function(memory, from, onclick)
{
	from -= from % 4;
	var oldFirstRow = this.table.firstChild;
	for (var i = from; i < this.fromAddress; i += 4)
	{
		this.rows[i] = this.disassemble(memory, i, onclick);
		this.rows[i].classList.add("before");
		this.table.insertBefore(this.rows[i], oldFirstRow);
	}
	this.fromAddress = from;
}

DisassemblyTable.prototype.expandBottom = function(memory, to, onclick)
{
	for (var i = this.toAddress; i < to; i += 4)
	{
		this.rows[i] = this.disassemble(memory, i, onclick);
		this.rows[i].classList.add("after");
		this.table.appendChild(this.rows[i]);
	}
	this.toAddress = to;
}

DisassemblyTable.prototype.reset = function(memory, from, to, pc, gotoHandler, bpHandler)
{
	this.rows = {};
	this.fromAddress = from - from % 4;
	this.toAddress = to - to % 4;
	
	while (this.table.childNodes.length > 0)
		this.table.removeChild(this.table.firstChild);
	
	for (var i = this.fromAddress; i != this.toAddress; i += 4)
	{
		this.rows[i] = this.disassemble(memory, i, gotoHandler, bpHandler);
		if (i < pc) this.rows[i].classList.add("before");
		else if (i > pc) this.rows[i].classList.add("after");
		this.table.appendChild(this.rows[i]);
	}
}

DisassemblyTable.prototype.disassemble = function(memory, address, gotoHandler, bpHandler)
{
	var translated = memory.translate(address);
	
	var bits = memory.read32(address);
	var op = Disassembler.getOpcode(bits);
	var comment = Disassembler.getOpcodeAsString(op);
				
	var tr = document.createElement("tr");
	var actionTD = document.createElement("td");
	var addressTD = document.createElement("td");
	var instrTD = document.createElement("td");
	
	actionTD.textContent = "→";
	addressTD.textContent = Recompiler.formatHex(address);
	instrTD.textContent = comment;
	
	actionTD.style.cursor = "pointer";
	actionTD.addEventListener("click", gotoHandler);
	addressTD.addEventListener("click", bpHandler);
	
	if (comment === undefined)
	{
		tr.classList.add("invalid");
		comment = "undefined (" + Recompiler.formatHex(bits) + ")";
	}
	else if (comment == "nop")
		tr.classList.add("nop");
	
	if (translated.buffer == MemoryMap.unmapped)
		tr.classList.add("invalid");
	else if (comment !== undefined && (comment[0] == "j" || comment[0] == "b"))
		tr.classList.add("jump");
	
	tr.appendChild(actionTD);
	tr.appendChild(addressTD);
	tr.appendChild(instrTD);
	
	return tr;
}