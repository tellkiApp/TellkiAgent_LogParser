//1234 "C:\Program Files\Tellki SmartAgent\log" "agent.log" "1" "2014-11-05T12:25:00Z" "Debug,Error"


var fs = require("fs");
var LineByLineReader = require('line-by-line');
var md5 = require('js-md5');


var metricId = "220:5";
var tempDir = "/tmp";


//####################### EXCEPTIONS ################################

function InvalidParametersNumberError() {
    this.name = "InvalidParametersNumberError";
    this.message = ("Wrong number of parameters.");
}
InvalidParametersNumberError.prototype = Object.create(Error.prototype);
InvalidParametersNumberError.prototype.constructor = InvalidParametersNumberError;

function InvalidDateError() {
    this.name = "InvalidDateError";
    this.message = "Invalid date.";
}
InvalidDateError.prototype = Object.create(Error.prototype);
InvalidDateError.prototype.constructor = InvalidDateError;


function FileError(message) {
    this.name = "FileError";
    this.message = message;
}
FileError.prototype = Object.create(Error.prototype);
FileError.prototype.constructor = FileError;


function CreateTmpDirError(message)
{
	this.name = "CreateTmpDirError";
    this.message = message;
}
CreateTmpDirError.prototype = Object.create(Error.prototype);
CreateTmpDirError.prototype.constructor = CreateTmpDirError;


function WriteOnTmpFileError(message)
{
	this.name = "WriteOnTmpFileError";
    this.message = message;
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
			process.exit(3);
		}
		else if(err instanceof InvalidDateError)
		{
			console.log(err.message);
			process.exit(16);
		}
		else if(err instanceof FileError)
		{
			console.log(err.message);
			process.exit(15);
		}
		else if(err instanceof CreateTmpDirError)
		{
			console.log(err.message);
			process.exit(21);
		}
		else if(err instanceof WriteOnTmpFileError)
		{
			console.log(err.message);
			process.exit(22);
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
	
	if(args.length == 6)
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
	//target
	var targetUUID = args[0];
	
	//directory
	var directory = args[1];
	
	//filename
	var filename = args[2];
	
	//file position
	var position = parseInt(args[3]);
	
	var dateTime = args[4];
	
	var timestamp = -1;
	
	if (dateTime !== "-1")
	{
		timestamp = new Date(dateTime).getTime();
		
		if(isNaN(timestamp))
		{
			throw new InvalidDateError()
		}
	}
	
	var patterns = args[5].replace(/\\\\,/g, ",");
	
	var patterns = patterns.split(",");
	
	//console.log(new Date(timestamp).toISOString())
	
	
	var matchPosition = new Object()
	matchPosition.line = position
	matchPosition.timestamp = timestamp
	
	var requests = []
	
	var request = new Object()
	request.targetUUID = targetUUID;
	request.directory = directory;
	request.filename = filename;
	request.position = position;
	request.dateTime = dateTime;
	request.patterns = patterns;
	request.matchPosition = matchPosition;
	
	
	requests.push(request)

	//console.log(JSON.stringify(requests));
	
	monitorLogParser(requests);
	
}




//################### OUTPUT ###########################

function output(matchingLines, info)
{
	for(var i in matchingLines)
	{
		var out = "";
		var matchingLine = matchingLines[i];
		
		out += new Date().toISOString();
		out += "|";
		out += metricId;
		out += "|";
		out += info.targetUUID;
		out += "|";
		out += info.filename;
		out += "|";
		out += info.order+":";
		out += matchingLine;
		
		console.log(out);
	}
}


function errorHandler(err)
{
	if(err instanceof CreateTmpDirError)
	{
		console.log(err.message);
		process.exit(21);
	}
	else if(err instanceof WriteOnTmpFileError)
	{
		console.log(err.message);
		process.exit(22);
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
		var targetUUID = request.targetUUID;

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
		
		//console.log(matchFiles);
		
		if (matchFiles.length === 0)
		{
			throw new FileError("Path doesn't exist.");
		}

		
		processFile(request, matchFiles, filePathPrefix, targetUUID, matchPatterns, 0);
		
	}
}



//###########################################

function processFile(request, matchFiles, filePathPrefix, targetUUID, matchPatterns, index)
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
		console.log(err)
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
						info.targetUUID = targetUUID;
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
					saveLineToDisk(currentLinePosition + 1, 0, targetUUID, matchFile.filePath, matchPatterns[i].re);
				}
			}
			else
			{
				if(saveFile)
				{
					saveLineToDisk(matchPatterns[i].line, 0, targetUUID, matchFile.filePath, matchPatterns[i].re);
				}
			}
		}
		
		if(!allFound && index < matchFiles.length)
		{	
			processFile(request, matchFiles, filePathPrefix, targetUUID, matchPatterns, index);
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
		
		finalPattern = finalPattern.replace(/\\\*/g, "(.*)");
		
		
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
		//console.log(err)
		throw new FileError("Path doesn't exist.");
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
				matchPosition = readLineFromDisk(request.targetUUID, filePath, matchPattern.re);
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
				matchPosition = readLineFromDisk(request.targetUUID, filePath, matchPattern.re);
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
				matchPosition = readLineFromDisk(request.targetUUID, filePath, matchPattern.re);
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

function readLineFromDisk(targetUUID, filePath, pattern)
{
	var statusFilePath = createStatusFileName(targetUUID, filePath, pattern);
	
	var file = fs.readFileSync(statusFilePath, 'utf8');
	
	var parts = file.toString('utf8').split("|");

	var line = parseInt(parts[0]);
	var timestamp = parseInt(parts[1]);

	var matchPosition = new Object()
	matchPosition.line = line
	matchPosition.timestamp = timestamp
	
	//console.log(matchPosition);
	
	return matchPosition;

}



function saveLineToDisk(lineNumber, timestamp, target, filePathPrefix, pattern)
{
	var statusFilePath = createStatusFileName(target, filePathPrefix, pattern);
	
	if (!fs.existsSync(__dirname+tempDir)) {
	
		try
		{
			fs.mkdirSync( __dirname+tempDir);
		}
		catch(e)
		{
			errorHandler(new CreateTmpDirError(e.message));
		}
	}
	
	fs.writeFile(statusFilePath, (lineNumber + "|" + timestamp), function(err) 
	{
		if(err) 
		{
			errorHandler(new WriteOnTmpFileError(err.message));
		}
	}); 
}



//#######################################################

function createStatusFileName(target, filePath, pattern)
{
	//TODO tmp dir on current path
	
	return __dirname +  tempDir + "/log_parser_monitor_" + md5(target + "|" + filePath + "|" + pattern) + ".dat";
}



