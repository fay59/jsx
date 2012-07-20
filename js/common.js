function including()
{
	var scriptCount = 0;
	var callback = null;
	
	function callbackCountdown()
	{
		scriptCount--;
		if (scriptCount == 0)
			callback();
	}
	
	function addScript(scriptURL)
	{
		scriptCount++;
		var script = document.createElement("script");
		script.type = "text/javascript";
		script.src = scriptURL;
		script.addEventListener("load", callbackCountdown);
		document.head.appendChild(script);
	}
	
	for (var i = 0; i < arguments.length; i++)
	{
		var arg = arguments[i];
		if (arg.call !== undefined)
		{
			callback = arg;
			break;
		}
		
		if (arg.forEach == undefined)
		{
			addScript(arg);
		}
		else
		{
			arg.forEach(addScript);
		}
	}
	
	if (scriptCount == 0)
	{
		setTimeout(callback, 0);
		return;
	}
}

// this needs to work to at least display a decent error message
if (including.bind === undefined)
{
	including.bind = function()
	{
		var self = arguments[0];
		var args = Array.prototype.slice.call(arguments, 1);
		
		return function()
		{
			for (var i = 0; i < arguments.length; i++)
				args.push(arguments[i]);
			including.apply(self, args);
		}
	}
}

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