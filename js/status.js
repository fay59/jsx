var StatusQueue = function(element)
{
	this.messageQueue = [];
	this.enqueue = false;
	this.element = element;
	this.swapDelay = 1000;
}

StatusQueue.prototype.display = function(text, color)
{
	if (this.enqueue)
	{
		if (color === undefined) // do not stack messages of no color
		{
			for (var i = 0; i < this.messageQueue.length; i++)
			{
				var message = this.messageQueue[i];
				if (message.color === undefined)
				{
					message.text = text;
					return;
				}
			}
		}
		this.messageQueue.push({text: text, color: color});
	}
	else
	{
		this._display(text, color);
		this.enqueue = true;
		setTimeout(this._dequeue.bind(this), this.swapDelay);
	}
}

StatusQueue.prototype._dequeue = function()
{
	if (this.messageQueue.length == 0)
	{
		this.enqueue = false;
	}
	else
	{
		var message = this.messageQueue.shift();
		this._display(message.text, message.color);
		setTimeout(this._dequeue.bind(this), this.swapDelay);
	}
}

StatusQueue.prototype._display = function(text, color)
{
	this.element.textContent = text;
	this.element.style.color = color === undefined ? 'inherit' : color;
}