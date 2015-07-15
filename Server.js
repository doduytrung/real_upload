var http=require("http");
var url=require("url");
var multipart=require("multipart");
var sys=require("sys");
var event=require("events");
var posix=require("posix");

var server=http.createServer(function(req,res){
	//simple path-based request dispatcher
	switch(url.parse(req.url).pathname){
		case '/':
			display_form(req,res);
			break;
		case '/upload':
			upload_file(req,res);
			break;
		default:
			show_error(req,res);
			break;
	}
});

//server would listen on port 8000
server.listen(8000);

//display upload form
function display_form(req,res){
	res.sendHeader(200,{"Content-Type":"text/html"});
	res.sendBody(
		'<form action="/upload" method="post" enctype="multipart/form-data">'+
		'<input type="file" name="upload-file"'+
		'<input type="submit" value="Upload">'+
		'</form>'
	);
	res.finish();
}

//write chunk of uploaded file
function write_chunk(req, fileDesc, chunk, isLast, closePromise){
	//pause receiving request data (until current chunk is written)
	req.pause();
	sys.debug("Writing chunk");
	posix.write(fileDesc,chunk).addCallback(function(){
		sys.debug("Wrote chunk");
		//resume receving request data
		req.resume();
		if(isLast){
			sys.debug("Closing file");
			posix.close(fileDesc).addCallback(function(){
				sys.debug("Closed file");
				//emit file close promise
				closePromise.emitSuccess();
			});
		}
	});
}


//handle file upload
function upload_file(req,res){
	//request body is binary
	req.setBodyEncoding("binary");
	//handle request as multipart
	var stream=new multipart.Stream(req);
	//create promise that will be used to emit event on the file close
	var closePromise=new events.Promise();
	//add handler for a request part received
	stream.addListener("part",function(body){
		sys.debug("Received part, name="+part.name+", filename="+part.filename);
		var openPromise=null;
		//add handler for a request part body chunk received
		part.addListener("body",function(chunk){
			//calculate upload progress
			var progress=(stream.bytesReceived/stream.bytesTotal*100).toFixed(2);
			var mb=(stream.bytesTotal/1024/1024).toFixed(1);
			sys.debug("Uploading "+mb+" MB ("+progress+"%)");
			//ask to open/create file
			if(openPromise==null){
				sys.debug("Opening file");
				openPromise=posix.open("./uploads/"+part.filename,process.O_CREAT|process.O_WRONLY,0600);
			}
			//add callback
			openPromise.addCallback(function(fileDesc){
				//write chunk to file
				write_chunk(req,fileDesc,chunk,
					(stream.bytesReceived==stream.bytesTotal),closePromise);
			});
		});
	});
	//add handler for thr request being completed
	stream.addListener("complete",function(){
		sys.debug("Request complete");
		//wait until file is closed
		closePromise.addCallback(function(){
			//render response
			res.sendHeader(200,{"Content-Type":"text/plain"});
			res.sendBody("Thanks for playing!");
			res.finish();
			sys.puts("\n=> Done");
		});
	});
}

//handle page not found error
function show_error(req,res){
	res.sendHeader(404,{"Content-Type":"text/plain"});
	res.sendBody("You are doing it wrong!");
	res.finish();
}



