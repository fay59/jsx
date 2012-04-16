function assert(cond, message, result)
{
	if (!cond)
	{
		if (result !== undefined)
			result.fail(message);
		
		throw new Error(message);
	}
}

function expect(message, func)
{
	return function(r)
	{
		try
		{
			func(r);
			r.fail("error '" + message + "' did not trigger");
		}
		catch (e)
		{
			assert(e.message == message, "expected message '" + message + "', got '" + e.message + "'", r);
		}
	}
}

function closureExpect(message, r, func)
{
	return function()
	{
		try
		{
			func();
			r.fail("error '" + message + "' did not trigger");
		}
		catch (e)
		{
			assert(e.message == message, "expected message '" + message + "', got '" + e.message + "'", r);
		}
		r.complete();
	}
}

function catchFail(r, func)
{
	return function()
	{
		try
		{
			func();
			r.complete();
		}
		catch (e)
		{
			r.fail(e.message);
		}
	}
}

var TestResult = function(element)
{
	element.textContent = '...';
	var finished = false;
	
	this.complete = function()
	{
		if (finished) return;
		element.className = 'success';
		element.textContent = 'success';
		finished = true;
	}
	
	this.fail = function(message)
	{
		if (finished) return;
		element.className = 'error';
		element.textContent = message;
		finished = true;
	}
}

var Tests = {
	"Memory Map": {
		"Parallel port addresses are contiguous": function(r)
		{
			function verify(a)
			{
				for (var i = 0; i < a.length; i++)
				{
					if (!isFinite(a[i]))
					{
						r.fail("non-contiguity at index " + i);
						return;
					}
				}
			}
			
			var parallel = new ParallelPortMemoryRange();
			verify(parallel.u8);
			verify(parallel.u16);
			verify(parallel.u32);
			r.complete();
		}
	}
};

document.addEventListener('DOMContentLoaded', function()
{
	for (var key in Tests)
	{
		var div = document.createElement('div');
		var title = document.createElement('h2');
		var list = document.createElement('ul');
		
		title.textContent = key;
		div.className = 'test-cat';
		
		div.appendChild(title);
		div.appendChild(list);
		document.body.appendChild(div);
		
		var tests = Tests[key];
		for (var testName in tests)
		{
			var result = document.createElement('li');
			result.textContent = testName;
			result.appendChild(document.createElement('br'));
			list.appendChild(result);
			
			var message = document.createElement('span');
			result.appendChild(message);
			
			var result = new TestResult(message);
			try
			{
				tests[testName](result);
			}
			catch (e)
			{
				result.fail(e.message);
			}
		}
	}
});