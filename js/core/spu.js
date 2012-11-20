// for now this is a null spu because sound processing is expensive
// and not all that essential
// based on Pete Bernert's null spu plugin: http://www.pbernert.com/html/dev.htm
//  (funny how somethimes you need help to write code that does nothing)

var SPU = function(psx, audio)
{
	this.psx = psx;
	this.audio = audio;
	this.reset();
}

SPU.prototype.writeRegister = function(reg, value)
{
	reg &= 0xfff;
	this.regArea[(reg - 0xc00) >>> 1] = value;
	
	switch (reg)
	{
	case 0x0da6: // H_SPUaddr
		this.spuAddr = value << 3;
		return;
	
	case 0x0da8: // H_SPUdata
		this.spuMem[this.spuAddr] = value;
		this.spuAddr += 2;
		if (this.spuAddr > 0x7ffff)
			this.spuAddr = 0;
		return;
	
	case 0x0daa: // H_SPUctrl
		this.spuCtrl = value;
		return;
	
	case 0x0dae: // H_SPUstat
		this.spuStat = val & 0xf800;
		return;
	
	case 0x0da4: // H_SPUirqAddr
		this.spuIrq = value;
		return;
	}
}

SPU.prototype.readRegister = function(reg)
{
	reg &= 0xfff;
	if (reg >= 0x0c00 && reg < 0x0d80)
	{
		switch (reg & 0xf)
		{
		case 12:
			this.adsrDummyVol = !this.adsrDummyVol;
			return this.adsrDummyVol | 0;
		
		case 14:
			return 0;
		}
	}
	
	switch (reg)
	{
	case 0x0daa: // H_SPUctrl
		return this.spuCtrl;
	
	case 0x0dae: // H_SPUstat
		return this.spuStat;
	
	case 0x0da6: // H_SPUaddr
		return this.spuAddr >>> 3;
	
	case 0x0da8: // H_SPUdata
	{
		var returnValue = this.spuMem[this.spuAddr >>> 1];
		this.spuAddr += 2;
		if (this.spuAddr > 0x7ffff)
			this.spuAddr = 0;
		return returnValue;
	}
	
	case 0x0da4:
		return this.spuIrq;
	}
	
	return this.regArea[(reg - 0xc00) >>> 1];
}

SPU.prototype.readDMA = function()
{
	var returnValue = this.spuMem[this.spuAddr >>> 1];
	this.spuAddr += 2;
	if (this.spuAddr > 0x7ffff)
		this.spuAddr = 0;
	return returnValue;
}

SPU.prototype.writeDMA = function(value)
{
	this.spuMem[this.spuAddr >>> 1] = value;
	this.spuAddr += 2;
	if (this.spuAddr > 0x7ffff)
		this.spuAddr = 0;
}

SPU.prototype.readDMAMem = function(array, start, size)
{
	for (var i = 0; i < size; i++)
	{
		this.spuMem[this.spuAddr >>> 1] = array[start + i];
		this.spuAddr += 2;
		if (this.spuAddr > 0x7ffff)
			this.spuAddr = 0;
	}
}

SPU.prototype.writeDMAMem = function(array, start, size)
{
	for (var i = 0; i < size; i++)
	{
		array[i + start] = this.spuMem[this.spuAddr >>> 1];
		this.spuAddr += 2;
		if (this.spuAddr > 0x7ffff)
			this.spuAddr = 0;
	}
}

SPU.prototype.install = function(hwregs)
{
	for (var address = 0x1f801c00; address < 0x1f801de0; address += 2)
	{
		hwregs.wire16(address,
			this.readRegister.bind(this, address & 0xfff),
			this.writeRegister.bind(this, address & 0xfff));
	}
}

SPU.prototype.reset = function()
{
	this.spuCtrl = 0;
	this.spuStat = 0;
	this.spuIrq = 0;
	this.spuAddr = 0xffffffff;
	this.spuMem = new Uint16Array(0x40000);
	this.regArea = new Uint16Array(10000);
	this.adsrDummyVol = false;
}