
var fs = require("fs");
var LineByLineReader = require('line-by-line');
var md5 = require('js-md5');

var metricId = "220:5";
var tempDir = "/tmp";


//####################### EXCEPTIONS ################################

function InvalidParametersNumberError() {
    this.name = "InvalidParametersNumberError";
    this.message = "Wrong number of parameters.";
	this.code = 3;
}
InvalidParametersNumberError.prototype = Object.create(Error.prototype);
InvalidParametersNumberError.prototype.constructor = InvalidParametersNumberError;

function InvalidDateError() {
    this.name = "InvalidDateError";
    this.message = "Invalid date.";
	this.code = 16;
}
InvalidDateError.prototype = Object.create(Error.prototype);
InvalidDateError.prototype.constructor = InvalidDateError;


function FileError() {
    this.name = "FileError";
    this.message = "";
	this.code = 15;
}
FileError.prototype = Object.create(Error.prototype);
FileError.prototype.constructor = FileError;


function CreateTmpDirError()
{
	this.name = "CreateTmpDirError";
    this.message = "";
	this.code = 21;
}
CreateTmpDirError.prototype = Object.create(Error.prototype);
CreateTmpDirError.prototype.constructor = CreateTmpDirError;


function WriteOnTmpFileError()
{
	this.name = "WriteOnTmpFileError";
    this.message = "";
	this.code = 22;
}
WriteOnTmpFileError.prototype = Object.create(Error.prototype);
WriteOnTmpFileError.prototype.constructor = WriteOnTmpFileError;


// ############# INPUT ###################################

(function() {
	try
	{
		monitorInput(process.argv.slice(2));
	}
	catch(err)
	{	
		if(err instanceof InvalidParametersNumberError)
		{
			console.log(err.message);
			process.exit(err.code);
		}
		else if(err instanceof InvalidDateError)
		{
			console.log(err.message);
			process.exit(err.code);
		}
		else if(err instanceof FileError)
		{
			console.log(err.message);
			process.exit(err.code);
		}
		else if(err instanceof CreateTmpDirError)
		{
			console.log(err.message);
			process.exit(err.code);
		}
		else if(err instanceof WriteOnTmpFileError)
		{
			console.log(err.message);
			process.exit(err.code);
		}
		else
		{
			console.log(err.message);
			process.exit(1);
		}
	}
}).call(this)



function monitorInput(args)
{
	
	if(args.length == 5)
	{
		monitorInputProcess(args);
	}
	else
	{
		throw new InvalidParametersNumberError()
	}
	
	
	
}


function monitorInputProcess(args)
{
	
	//directory
	var directory = args[0];
	
	//filename
	var filename = args[1];
	
	//file position
	var position = parseInt(args[2]);
	
	var dateTime = args[3];
	
	var timestamp = -1;
	
	if (dateTime !== "-1")
	{
		timestamp = new Date(dateTime).getTime();
		
		if(isNaN(timestamp))
		{
			throw new InvalidDateError()
		}
	}
	
	var patterns = args[4].replace(/\\\\,/g, ",");
	
	var patterns = patterns.split(",");
	
	
	var matchPosition = new Object()
	matchPosition.line = position
	matchPosition.timestamp = timestamp
	
	var requests = []
	
	var request = new Object()
	request.directory = directory;
	request.filename = filename;
	request.position = position;
	request.dateTime = dateTime;
	request.patterns = patterns;
	request.matchPosition = matchPosition;
	
	
	requests.push(request)
	
	monitorLogParser(requests);
	
}


//################### OUTPUT ###########################

function output(matchingLines, info)
{
	for(var i in matchingLines)
	{
		var out = "";
		var matchingLine = matchingLines[i];
		
		out += metricId;
		out += "|";
		out += info.order+":";
		out += matchingLine.replace(/\|/g, "\\u007c");
		out += "|";
		out += info.filename;
		out += "|";
		
		console.log(out);
	}
}


function errorHandler(err)
{
	if(err instanceof CreateTmpDirError)
	{
		console.log(err.message);
		process.exit(err.code);
	}
	else if(err instanceof WriteOnTmpFileError)
	{
		console.log(err.message);
		process.exit(err.code);
	}
	else
	{
		console.log(err.message);
		process.exit(1);
	}
}


// ################# MONITOR ###########################
function monitorLogParser(requests) 
{
	
	for(var i in requests)
	{
		var request = requests[i];
		
		// Create MatchPatterns.
		var matchPatterns = createMatchPatterns(request.patterns);
		
		var directory = request.directory;
		var filenamePrefix = request.filename;

		var filePathPrefix = directory + "/" + filenamePrefix;
		
		// Parse filename prefix.
		filenamePrefix = filenamePrefix.replace(/\*/g, "(.*)");
		filenamePrefix = "^"+filenamePrefix+"$"
		
		
		var pattern = new RegExp(filenamePrefix);
		
		// Get all matching files by directory.
		var directoryFilenames = listFiles(directory);
		
		var matchFiles = [];

		for (var i in directoryFilenames)
		{
			var directoryFilename = directoryFilenames[i];
		
			var arrMatches = directoryFilename.match(pattern);
			
			if(arrMatches !== null)
			{
				var filePath = directory + "/" + directoryFilename;
				
				var stat = fs.statSync(filePath);
				var lastModifiedFile = new Date(stat.mtime).getTime();
				
				var matchFile = new Object()
				matchFile.filename = directoryFilename;
				matchFile.filePath = filePath;
				matchFile.fileDate = lastModifiedFile;
				
				matchFiles.push(matchFile);
			}
		}
		
		if (matchFiles.length === 0)
		{
			var ex = new FileError();
			ex.message = "Path doesn't exist.";
			throw ex;
		}

		
		processFile(request, matchFiles, filePathPrefix, matchPatterns, 0);
		
	}
}



//###########################################

function processFile(request, matchFiles, filePathPrefix, matchPatterns, index)
{
	var currentLinePosition = 0;
	var line = 0;
	var finalCurrentPosition = 0;
	var matchLines = [];
	
	var matchFile = matchFiles[index];
	
	var saveFile = true;
	
	var lr = new LineByLineReader(matchFile.filePath);

	lr.on('error', function (err) {
		// 'err' contains error object
		errorHandler(err);
	});

	lr.on('line', function (l) {
		// 'line' contains the current line without the trailing newline character.
		for (var j in matchPatterns)
		{
			var matchPattern = matchPatterns[j];
		
			if (matchPattern.found)
			{
				continue; // Skip matched patterns.
			}

			var matchPosition = createMatchPosition(request, matchFile.filePath, matchPattern);

			
			if (matchPosition.timestamp === 0 || ( matchFile.fileDate >= matchPosition.timestamp))
			{
				saveFile = true;

				if (currentLinePosition >= matchPosition.line)
				{
					var arrMatches = l.match(matchPattern.re);
					
					if(arrMatches !== null && !matchPattern.found)
					{
						// Match found.
						matchPattern.found = true;
						matchPattern.line = currentLinePosition+1;
						matchLines.push(l);
						
						finalCurrentPosition = currentLinePosition + 1;
						
						var info = new Object()
						info.filename = matchFile.filename;
						info.re = matchPattern.re;
						info.order = matchPattern.order;
						info.matchLine = finalCurrentPosition;
					
						output(matchLines, info);
						
						matchLines = [];
							
					}
				}
			}
			else
			{
				saveFile = false;
				lr.close();
			}
		
		}
		
		
		currentLinePosition++;
		
	});

	
	lr.on('end', function () {

		
		index = index + 1;
		
		var allFound = true;
		
		for(var i in matchPatterns)
		{	
			if(!matchPatterns[i].found)
			{
				allFound = false;
				
				if(saveFile)
				{
					saveLineToDisk(currentLinePosition + 1, 0, matchFile.filePath, matchPatterns[i].re);
				}
			}
			else
			{
				if(saveFile)
				{
					saveLineToDisk(matchPatterns[i].line, 0, matchFile.filePath, matchPatterns[i].re);
				}
			}
		}
		
		if(!allFound && index < matchFiles.length)
		{	
			processFile(request, matchFiles, filePathPrefix, matchPatterns, index);
		}
		
	});
}




// ##########################################

function createMatchPatterns(patterns)
{
	// Handle multiple patterns.

	var matchPatterns = [];

	
	for (var i in patterns)
	{
		var finalPattern = patterns[i];
		
		finalPattern = finalPattern.replace(/\*/g, "(.*)");
		
		if (finalPattern.indexOf("^") !== 0)
		{
			finalPattern = "(.*)" + finalPattern;
		}

		if (finalPattern.indexOf("$") !== finalPattern.length-1)
		{
			finalPattern = finalPattern + "(.*)";
		}
		
		var rePattern = new RegExp(finalPattern);
		
		var pattern = new Object()
		pattern.found = false;
		pattern.order = i;
		pattern.re = rePattern;
		pattern.line = 0;
		pattern.pattern = patterns[i];
		
		matchPatterns.push(pattern);

	}

	return matchPatterns;
}


//#######################################################

function listFiles(directory)
{
	var filenames = [];

	try
	{
		var files = fs.readdirSync(directory);
		
		for(var i in files)
		{
			var stat = fs.statSync(directory+'/'+files[i]);
			
			if(!stat.isDirectory())
			{
				filenames.push(files[i]);
			}
		}
	}
	catch(err)
	{
		var ex = new FileError();
		ex.message = "Path doesn't exist.";
		throw ex;
	}
	
	return filenames;
}


//#######################################################

function createMatchPosition(request, filePath, matchPattern)
{
	var matchPosition = null;
	
	if (request.position === -1)
	{
		// Read from last position.
		
		if (request.matchPosition.timestamp === -1)
		{
			// -1, -1
			try
			{
				matchPosition = readLineFromDisk(filePath, matchPattern.re);
			}
			catch (err)
			{
				// On error start from line 0, first file.
				matchPosition = new Object();
				matchPosition.line = 0;
				matchPosition.timestamp = 0;
			}
		}
		else
		{
			// -1, TS
			try
			{
				matchPosition = readLineFromDisk(filePath, matchPattern.re);
				matchPosition.timestamp = request.matchPosition.timestamp;
			}
			catch (err)
			{
				// On error start from line 0.
				matchPosition = new Object();
				matchPosition.line = 0;
				matchPosition.timestamp = request.matchPosition.timestamp; 
			}
		}
	}
	else
	{
		// Read from given position.

		if (request.matchPosition.timestamp === -1)
		{
			// POS, -1
			try
			{
				matchPosition = readLineFromDisk(filePath, matchPattern.re);
				matchPosition.line = request.position;
			}
			catch (err)
			{
				// On error start from given line of the first file.
				matchPosition = new Object();
				matchPosition.line = request.position;
				matchPosition.timestamp = 0;

			}
		}
		else
		{
			// POS, TS
			matchPosition = request.matchPosition;
		}
	}

	return matchPosition;
}


//#######################################################

function readLineFromDisk(filePath, pattern)
{
	var statusFilePath = createStatusFileName(filePath, pattern);
	
	var file = fs.readFileSync(statusFilePath, 'utf8');
	
	var parts = file.toString('utf8').split("|");

	var line = parseInt(parts[0]);
	var timestamp = parseInt(parts[1]);

	var matchPosition = new Object()
	matchPosition.line = line
	matchPosition.timestamp = timestamp

	return matchPosition;

}



function saveLineToDisk(lineNumber, timestamp, filePathPrefix, pattern)
{
	var statusFilePath = createStatusFileName(filePathPrefix, pattern);
	
	if (!fs.existsSync(__dirname+tempDir)) {
	
		try
		{
			fs.mkdirSync( __dirname+tempDir);
		}
		catch(e)
		{
			var ex = new CreateTmpDirError();
			ex.message = e.message;
			errorHandler(ex);
		}
	}
	
	fs.writeFile(statusFilePath, (lineNumber + "|" + timestamp), function(err) 
	{
		if(err) 
		{
			var ex = new WriteOnTmpFileError();
			ex.message = err.message;
			errorHandler(ex);
		}
	}); 
}



//#######################################################

function createStatusFileName(filePath, pattern)
{
	return __dirname +  tempDir + "/log_parser_monitor_" + md5(filePath + "|" + pattern) + ".dat";
}



