import os
import boto3
from botocore.exceptions import NoCredentialsError

class S3Client:
    def __init__(self):
        self.bucket_name = os.getenv("S3_BUCKET_NAME", "media-listing-pipeline-images")
        self.region = os.getenv("S3_REGION", "us-east-1")
        
        aws_id = os.getenv("AWS_ACCESS_KEY_ID")
        aws_key = os.getenv("AWS_SECRET_ACCESS_KEY")
        if not aws_id or not aws_key:
            self.mock_mode = True
        else:
            self.mock_mode = False
            
        # In a real scenario, credentials would be loaded from env or IAM roles.
        self.s3 = boto3.client('s3')

    def upload_image(self, file_path: str) -> str:
        """
        Uploads an image to S3 and returns a public URL for eBay API.
        """
        try:
            filename = os.path.basename(file_path)
            s3_key = f"images/raw/{filename}"

            if not os.path.exists(file_path):
                print(f" [!] Image not found: {file_path}")
                return f"https://mock-bucket.s3.amazonaws.com/images/raw/{filename}"

            if self.mock_mode:
                print(f" [MOCK] AWS credentials missing. Returning mock public URL for {filename}.")
                return f"https://mock-bucket.s3.amazonaws.com/images/raw/{filename}"
            
            self.s3.upload_file(file_path, self.bucket_name, s3_key)
            print(f" [S3Client] Uploaded {filename} to s3://{self.bucket_name}/{s3_key}")
            public_url = f"https://{self.bucket_name}.s3.{self.region}.amazonaws.com/{s3_key}"
            return public_url
            
        except Exception as e:
            print(f" [!] S3 Upload Error: {e}")
            filename = os.path.basename(file_path)
            return f"https://mock-bucket.s3.amazonaws.com/images/raw/{filename}"
