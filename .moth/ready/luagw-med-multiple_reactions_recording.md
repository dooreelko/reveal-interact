same user should be able to submit multiple reactions for the same session and page.
this means we need to update DataStore to introduce the sharding/prefixing. 
it should have a new generic argument for the key type of type string | {key: string, shards: string[]}, defaulting to string 
and the implementations will decide how to interpret that - cloudflare will combine the parts into one key that will allow
for listing with shards as prefixes, dynamodb will use indexes, etc

finally there's a commented unit test for that case that can be enabled
